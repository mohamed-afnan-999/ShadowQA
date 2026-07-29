import {z} from "zod";
import {runFullAudioAudit} from "../services/auditPipeline.js";
import {viewToDownloadDriveLink} from "../services/googleFileURLService.js";

export const runFullAudioAuditTool = {
    name: "run_full_audio_audit",
    description:'Runs the complete QA audit pipeline on a recruiter\'s audio file. It automatically transcribes the audio, isolates the interview segment, and evaluates it against standard compliance checklists. Use this whenever the user asks to audit, review, or check a new audio recording.',
    schema: {
        audioFileURL: z.string().describe("The direct URL path to the Google Drive audio file.")
    },
    handler: async (args) => {
        let audioFileURL = Object.values(args)[0]; // grab the 1st value in the object no matter the key name (audioFileURL OR audio_link OR url OR audio_url)

        if(!audioFileURL || typeof audioFileURL !== "string") {
            throw new Error("The LLM failed to provide a valid audio URL.");
        }

        // convert Google Drive 'view' link to 'direct download' link
        audioFileURL = viewToDownloadDriveLink(audioFileURL);

        try {
            const auditResult = await runFullAudioAudit(audioFileURL);

            if (!auditResult.isSuccess) {
                return {
                    isError: true,
                    content: [
                        {
                            type: 'text',
                            text: `Audit pipeline failed -> ${auditResult.message}`
                        }
                    ]
                };
            }

            return {
                isError: false,
                content: [
                    {
                        type: 'text',
                        // Return the structured JSON so the LLM can read the pass/fail reasoning and summarize it for the user
                        text: JSON.stringify({
                            status: auditResult.message,
                            isolatedTranscript: auditResult.isolatedTranscript,
                            complianceReport: auditResult.report
                        }, null, 2)
                    }
                ]
            };
        } catch (error) {
            console.error(`Macro-Tool Error: ${error.message}`);
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: `Failed to execute the audio audit pipeline: ${error.message}`
                    }
                ]
            };
        }
    }
}