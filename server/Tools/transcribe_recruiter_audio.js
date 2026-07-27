// Tool 1
import dotenv from 'dotenv';
dotenv.config();

import {z} from "zod";
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const downloadAudio = async (audioURL, destinationPath) => {
    // helper function to download audio from the internal audio URLs

    let tempDir = null, tempFilePath = null;
    let isDownloaded = false;       // tracks the status of the file download

    try {
        // create a temp dir
        tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'extracted-audio-files-'));
        // create temp file to store the audio file extracted
        tempFilePath = destinationPath || path.join(tempDir, 'audio.mp3');

        // create a writer that will write to the target file
        const writer = fs.createWriteStream(tempFilePath);

        // extract and download audio using 'axios'
        const response = await axios.get(audioURL, {
            responseType: 'stream'
        });

        // pipe the downloaded audio file data into the writer to write it to the temporary target file
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        isDownloaded = true;
        console.error(`Successfully downloaded the audio recording to ${tempFilePath}`);
    } catch (error) {
        // log the error
        console.error(`Failed to retrieve and download the audio recording: ${error}`);
        isDownloaded = false;
    }

    // cleanup the temp directory after the transcription is complete

    return {
        isDownloaded: isDownloaded,
        filePath: tempFilePath,
        targetDir: tempDir
    };
}

const optimizeAudioForWhisper = async (inputFilePath) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(inputFilePath)) {
            return reject(new Error("Input file does not exist."));
        }

        const outputDir = path.dirname(inputFilePath);
        const tempFileName = `optimized_${randomUUID()}.mp3`;
        const outputFilePath = path.join(outputDir, tempFileName);

        ffmpeg(inputFilePath)
            .audioFrequency(16000)      // Force 16 kHz sample rate
            .audioChannels(1)           // Force mono (1 channel)
            .audioBitrate("64k")        // Compress to 64 kbps MP3
            .format("mp3")
            .on("end", () => {
                resolve(outputFilePath);
            })
            .on("error", (err) => {
                reject(err);
            })
            .save(outputFilePath);
    });
}

const transcribeAudio = async (audioFilePath) => {
    // transcribe the audio file
    let transcriptionResult = {};

    try {
        if(!fs.existsSync(audioFilePath)) {
            console.error("Audio File unavailable (does not exist)\n");
            return {
                transcribed: false,
                transcription: null
            };
        }

        const audioFile = fs.createReadStream(audioFilePath);

        // call the groq API for transcription
        let transcription = await groq.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-large-v3-turbo',
            prompt: 'Interview transcript, recruitment, QA audit, candidate interaction.',
            response_format: 'verbose_json',     // for word-level timestamps
            timestamp_granularities: ['segment', 'word']
        });

        console.error(`Transcription successful`);
        transcriptionResult = {
            transcribed: true,
            transcription: transcription
        };
    } catch (error) {
        console.error(`Transcription failed`);
        transcriptionResult = {
            transcribed: false,
            transcription: null
        };
    }

    // cleanup the temp directory after the transcription is complete

    return transcriptionResult;
}

// Register tools

// Tool 1
export const transcribeRecruiterAudioTool = {
    // name of tool - so the LLM can uniquely identify this tool
    name: 'transcribe_recruiter_audio',
    // tool description - so the LLM knows what this tool is for
    description: 'Transcribe recruiter audio clips to text for QA auditing purposes',
    schema: {
        // Zod parameter schema for input params - to ensure that LLM gives the correct inputs (with correct types) to this tool
        audioFileURL: z.string().describe("The URL path to an audio clip recording")
    }
    ,
    // actual executable function - LLM can use this on demand
    handler: async ({audioFileURL}) => {
        // logic to transcribe the audio file

        // 1. locate and extract the audio file using the filePath/URL ✅
        // 2. pass to whisperAI via Groq for transcription ✅
        // 3. return the transcription to the AI agent (LLM) ✅

        // download the audio file into a temporary file
        const {isDownloaded, filePath, targetDir} = await downloadAudio(audioFileURL);

        if (!isDownloaded) {
            console.error("Failed to download the audio file");
            if (targetDir) {
                try {
                    await fs.promises.rm(targetDir, {recursive: true, force: true});
                } catch (error) {
                    console.error(`Failed to cleanup temporary directory: ${targetDir}`);
                }
            }
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: `Failed to download the audio file`
                    }
                ]
            };
        }

        let transcribed = false, transcription = null;

        try {
            // convert file to mp3 and pass the transcription to whisper-AI via groq-sdk for transcription
            let targetFile = filePath;
            if (!filePath.endsWith('.mp3')) {
                targetFile = await optimizeAudioForWhisper(filePath);
            }

            const result = await transcribeAudio(targetFile);
            transcribed = result.transcribed;
            transcription = result.transcription;
        } catch (error) {
            console.error(`Audio processing/transcription error: ${error.message}`);
        } finally {
            // remove the audio file itself - transcripts will be used for auditing
            if (targetDir) {
                try {
                    await fs.promises.rm(targetDir, {recursive: true, force: true});
                } catch (cleanupError) {
                    console.error(`Failed to cleanup temporary directory: ${targetDir}`);
                }
            }
        }

        if (!transcribed || !transcription) {
            console.error("Transcription unavailable")
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: `Transcription unavailable`
                    }
                ]
            };
        }
        // TODO: save the raw ranscription somewhere on mongoDB

        return {
            isError: false,
            content: [      // mandatory expected field by LLM for outputs/results of this tool
                {
                    type: "text",
                    // We must return the raw transcription object (stringified) which includes segments and word level timestamps, not just the text property.
                    text: JSON.stringify(transcription),
                }
            ]
        }
    }
}
