configDotenv()
import { configDotenv } from "dotenv";
import Groq from "groq-sdk";

const groq=new Groq({apiKey: process.env.GROQ_API_KEY})

async function main(){
           const completion=await groq.chat.completions.create({

            model:'llama-3.3-70b-versatile',
            messages:[
                {
                    role:'system',
                    content:'You are Jarvis smart asistence that give answer like tony starks jarves'
                },
                {
                    role:'user',
                    content:'Hi'
                }
            ]
           })
   console.log(completion.choices[0])
           
}

main()