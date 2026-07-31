import {z} from "zod";
import {runFullAudioAudit} from "../services/auditPipeline.js";
import { pipelineProgress } from "../services/progressEmitter.js";

export const runFullAudioAuditTool = {
    name: "run_full_audio_audit",
    description:'Runs the complete QA audit pipeline. It accepts a direct API link containing audio chunks, downloads them, stitches them, transcribes them, and evaluates the interview against standard compliance checklists.',
    schema: {
        companyApiURL: z.string().describe("The direct URL or API link provided by the user.")
    },
    handler: async (args) => {
        // 🚨 Defensive debug: Let's log exactly what the LLM tried to pass
        console.log("Raw args received in tool handler:", args);

        let companyApiURL = Object.values(args)[0];

        if (!companyApiURL || typeof companyApiURL !== 'string') {
            throw new Error(`The LLM failed to provide a valid API URL. It provided: ${JSON.stringify(companyApiURL)}`);
        }

        try {
            // ==== EMIT AUDIT PIPELINE STATUS ====
            const logProgress = async (statusText) => {
                console.log(`[PIPELINE STATUS]: ${statusText}`);
                // Broadcast the update
                pipelineProgress.emit('status', statusText);
            }
            const auditResult = await runFullAudioAudit(companyApiURL, logProgress);

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
            }
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