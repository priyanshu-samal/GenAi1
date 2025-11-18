import { configDotenv } from "dotenv";
import Groq from "groq-sdk";
import { tavily } from "@tavily/core";
import NodeCache from "node-cache";
import express from "express";
import cors from "cors";

configDotenv();

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Initialize cache with 1 hour TTL (time to live)
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

// Available tools definition
const tools = [
  {
    type: "function",
    function: {
      name: "webSearch",
      description: "Search for latest info and news on the internet",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to look up",
          },
        },
        required: ["query"],
      },
    },
  },
];

// Track tool calls to prevent infinite loops
let toolCallTracker = {
  calls: [],
  maxSameCallsAllowed: 2, // Max times same query can be called in one conversation turn
};

function resetToolCallTracker() {
  toolCallTracker.calls = [];
}

function isToolCallLooping(functionName, args) {
  const callSignature = `${functionName}:${JSON.stringify(args)}`;
  const sameCallCount = toolCallTracker.calls.filter(c => c === callSignature).length;
  
  if (sameCallCount >= toolCallTracker.maxSameCallsAllowed) {
    console.log(`\n⚠️ Loop detected! Same tool called ${sameCallCount} times: ${callSignature}`);
    return true;
  }
  
  toolCallTracker.calls.push(callSignature);
  return false;
}

async function webSearch({ query }) {
  // Check cache first
  const cacheKey = `search:${query.toLowerCase().trim()}`;
  const cachedResult = cache.get(cacheKey);
  
  if (cachedResult) {
    console.log("💾 Using cached result");
    return cachedResult;
  }
  
  // Perform actual search
  const response = await tvly.search(query);
  console.log("🔍 Search Results Retrieved (Fresh)");
  
  const result = JSON.stringify(response.results || response);
  
  // Store in cache
  cache.set(cacheKey, result);
  
  return result;
}

async function chat(userMessage, conversationHistory) {
  // Reset tool call tracker for new conversation turn
  resetToolCallTracker();
  
  // Construct messages for the API call
  const messages = [
    {
      role: "system",
      content: `You are a smart personal assistant who answers questions. You have the following tools:
1. webSearch({query}) - Search the latest info in real-time on the internet

Important: If you've already searched for similar information recently, use that knowledge instead of searching again.`,
    },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  let assistantResponse = null;
  let maxIterations = 5;
  let iterations = 0;

  // Keep calling until we get a final text response
  while (iterations < maxIterations) {
    iterations++;
    console.log(`\n🔄 Iteration ${iterations}/${maxIterations}`);
    
    try {
      const completion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        messages: messages,
        tools: tools,
        tool_choice: "auto",
        max_tokens: 4096,
      });

      const message = completion.choices[0].message;
      
      // If the assistant wants to use tools
      if (message.tool_calls && message.tool_calls.length > 0) {
        console.log(`\n⚙️ Assistant wants to use ${message.tool_calls.length} tool(s)...`);
        
        // Check if we're about to loop infinitely
        let loopDetected = false;
        for (const toolCall of message.tool_calls) {
          const args = JSON.parse(toolCall.function.arguments);
          if (isToolCallLooping(toolCall.function.name, args)) {
            loopDetected = true;
            break;
          }
        }
        
        // If loop detected, force the model to give an answer
        if (loopDetected) {
          console.log("\n🛑 Forcing response without more tool calls...");
          
          // Call API again but without tools to force a text response
          const forcedCompletion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            messages: [
              ...messages,
              {
                role: "user",
                content: "Please provide your answer based on the information you already have. Do not make any more tool calls."
              }
            ],
            max_tokens: 4096,
          });
          
          assistantResponse = forcedCompletion.choices[0].message.content;
          break;
        }
        
        // Add assistant's tool call message to history
        messages.push({
          role: "assistant",
          content: message.content || "",
          tool_calls: message.tool_calls,
        });

        // Execute each tool call
        for (const toolCall of message.tool_calls) {
          console.log(`\n🔧 Tool: ${toolCall.function.name}`);
          console.log(`📋 Arguments: ${toolCall.function.arguments}`);
          
          if (toolCall.function.name === "webSearch") {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              console.log(`\n🔍 Searching for: "${args.query}"`);

              const searchResult = await webSearch(args);

              // Add tool result to history
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: "webSearch",
                content: searchResult,
              });
            } catch (error) {
              console.error(`\n❌ Tool execution error: ${error.message}`);
              // Add error result
              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                name: "webSearch",
                content: JSON.stringify({ error: error.message }),
              });
            }
          }
        }
      } else {
        // Got final response
        assistantResponse = message.content;
        break;
      }
    } catch (error) {
      console.error(`\n❌ API Error (Iteration ${iterations}):`, error.message);
      
      // If it's a function calling error, try without tools
      if (error.message.includes("tool_use_failed") || error.message.includes("Failed to call a function")) {
        console.log("\n🔄 Retrying without function calling...");
        
        try {
          const fallbackCompletion = await groq.chat.completions.create({
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            messages: messages,
            max_tokens: 4096,
          });
          
          assistantResponse = fallbackCompletion.choices[0].message.content;
          break;
        } catch (fallbackError) {
          console.error("\n❌ Fallback also failed:", fallbackError.message);
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  // If max iterations reached without response
  if (!assistantResponse) {
    assistantResponse = "I apologize, but I reached the maximum number of iterations. Let me summarize what I know so far based on the search results I obtained.";
    console.log("\n⚠️ Max iterations reached, providing partial answer");
  }

  return assistantResponse;
}

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Serve the frontend files
app.use(express.static("frontend"));

app.post("/chat", async (req, res) => {
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const response = await chat(message, history || []);
    res.json({ reply: response });
  } catch (error) {
    console.error("\n❌ Error in /chat endpoint:", error.message);
    res.status(500).json({ error: "An error occurred while processing your request." });
  }
});

app.listen(port, () => {
  console.log(`💬 Server listening on http://localhost:${port}`);
  console.log("👉 Open http://localhost:3000 in your browser to start chatting.");
});