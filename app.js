configDotenv();
import { configDotenv } from "dotenv";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function main() {
  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0,
    messages: [
      {
        role: "system",
        content:
          "You are Jarvis smart asistence that give answer like tony starks jarves short and only answer you have access to 1. webSearch({query}): {query: string}) // search latest on linternet",
      },
      {
        role: "user",
        content: "when i was iphone 16 launched?",
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "webSearch",
          description: "latest search latest info and news about india ",
          parameters: {
            type: "object",
            properties: {
              location: {
                type: "string",
                description: "The city and state, e.g. San Francisco, CA",
              },
              
            },
            required:['query']
            
          },
        },
      },
    ],
    tool_choice: "auto",
  });
  console.log(completion.choices[0].message, null, 2);
}

main();

async function webSearch({ query }) {
  return 'iphone'
}
