// Tool 2
import {z} from "zod";
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export const isolateInterviewSegmentTool = {
    name: 'isolate_interview_segment',
    description: 'Isolate the true interview segment of the audio trancriptions, filtering out irrelevant acoustic data, small-talk, and automated voicemail systems',
    schema: {
        rawTranscript: z.string().describe("The raw text transcript (stringified verbose JSON) of the whole audio clip with timestamp metadata.")
    },
    handler: async ({rawTranscript}) => {
        // 1. receives the audio transcripts
        // 2. uses a structured, detailed prompt to LLM (Llama) to filter irrelevant data and find timestamps for actual interview segment
        // 3. use the returned timestamps to clip out the transcriptions
        // 4. use the LLM to filter for surrounding traffic noise, small-talk, automated voicemails and post-conversational tone
        //      FORCE STRUCTURED JSON OUTPUTS FROM LLM
        // 5. return { isolationStatus, isolatedTranscript } to the next tool

        if (!rawTranscript) {
            console.error("Transcript unavailable");
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: `Transcript unavailable`
                    }
                ]
            };
        }

        try {
            const response = await groq.chat.completions.create({
                "model": "llama-3.3-70b-versatile",
                "temperature": 0.1, // to minimise hallucinations
                "messages": [
                    {
                        "role": "system",
                        "content": `You are a sophisticated, logical audio editor. Your job is to analyze the provided raw transcript (which includes temporal metadata and segments/words) to understand the conversational flow and temporal gaps. Identify standard introductory phrases (e.g., 'Hi, this is...', 'am I speaking with...') as the definitive start marker of the interview, and conclusive phrases (e.g., 'Thank you for your time', 'I'll send an email shortly') as the termination point. Extract and return a clean, consolidated string representing only the formal interview interaction. Completely remove dialing artifacts, automated voicemails, casual pre-interview small talk, and post-call administrative noise.
                        
                                    OUTPUT INSTRUCTIONS:
                                        You must output strictly in JSON format. The JSON object must contain exactly two keys:
                                            - "isolationStatus": A string indicating the status of extraction (e.g., "Success", "No Interview Found").
                                            - "isolatedTranscript": A string containing the cleaned and isolated interview text, strictly avoiding conversational metadata and dial-tones.`
                    },
                    {
                        "role": "user",
                        "content": rawTranscript
                    }
                ],

                // Force structured JSON output
                response_format: {type: "json_object"}
            });

            // parse the JSON response from Groq (LLM response)
            const parsedResponse = JSON.parse(response.choices[0].message.content);

            // result to LLM
            return {
                isError: false,
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(parsedResponse, null, 2)
                    }
                ]
            };

        } catch (err) {
            console.error(`Interview Isolation Error: ${err}`);

            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: `Isolation failed: ${err.message}`
                    }
                ]
            };
        }
    }
}