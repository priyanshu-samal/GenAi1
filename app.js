import { configDotenv } from "dotenv";
import Groq from "groq-sdk";
import { tavily } from "@tavily/core";
import readline from "readline";

configDotenv();

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Conversation history
const messages = [
  {
    role: "system",
    content: `You are a smart personal assistant who answers questions. You have the following tools:
1. webSearch({query}) - Search the latest info in real-time on the internet`,
  },
];

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

async function webSearch({ query }) {
  const response = await tvly.search(query);
  console.log("\n🔍 Search Results Retrieved");
  return JSON.stringify(response.results || response);
}

async function chat(userMessage) {
  // Add user message to history
  messages.push({
    role: "user",
    content: userMessage,
  });

  let assistantResponse = null;

  // Keep calling until we get a final text response
  while (true) {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      messages: messages,
      tools: tools,
      tool_choice: "auto",
    });

    const message = completion.choices[0].message;

    // If the assistant wants to use tools
    if (message.tool_calls && message.tool_calls.length > 0) {
      // Add assistant's tool call message to history
      messages.push(message);

      // Execute each tool call
      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === "webSearch") {
          const args = JSON.parse(toolCall.function.arguments);
          console.log(`\n🔧 Using tool: webSearch("${args.query}")`);

          const searchResult = await webSearch(args);

          // Add tool result to history
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: searchResult,
          });
        }
      }
    } else {
      // Got final response
      assistantResponse = message.content;
      messages.push(message);
      break;
    }
  }

  return assistantResponse;
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("💬 Chat with AI Assistant (type 'exit' to quit)\n");

  const askQuestion = () => {
    rl.question("You: ", async (input) => {
      const userInput = input.trim();

      if (userInput.toLowerCase() === "exit") {
        console.log("\n👋 Goodbye!");
        rl.close();
        return;
      }

      if (!userInput) {
        askQuestion();
        return;
      }

      try {
        const response = await chat(userInput);
        console.log(`\nAssistant: ${response}\n`);
      } catch (error) {
        console.error("\n❌ Error:", error.message, "\n");
      }

      askQuestion();
    });
  };

  askQuestion();
}

main().catch(console.error);