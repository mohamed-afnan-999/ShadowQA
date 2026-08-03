import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { randomUUID } from "crypto";    // needed for temp mp3 filename
import Groq from 'groq-sdk';
import {connectToDatabase, getActiveRecruiters} from "./dbService.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const optimizeAudioForWhisper = async (inputFilePath) => {
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

export const transcribeAudio = async (audioFilePath) => {
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

        // === Dynamic Recruiter Name Extraction and Feed ====
        // connect to DB and extract the recruiter names live (as it maybe updated)
        const dbConnection = await connectToDatabase();
        const recruiterNames = await getActiveRecruiters(dbConnection);
        let recruiterNamesString = null;

        if (!recruiterNames || recruiterNames.length === 0)
            recruiterNamesString = "Hajira Arfain, Ayesha, Roobi Naz";
        else {
            recruiterNamesString = recruiterNames.map(r => r.name).join(',');
        }

        // call the groq API for transcription
        let transcription = await groq.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-large-v3-turbo',
            // TODO: Add recruiter names, company name (BiziBees outsourcing) - this prompt gives whisper some vocabulary context to expect in the audio files for better transcription
            prompt: `Ensure that the recruiter names the company 'Bizi Bees Outsourcing'. This is an Interview clip for candidates being interviewed by recruiters from the comapny called 'Bizi Bees Outsourcing'. Recruitment, BPO, customer support, human resources, candidate, salary, notice period, shift, voice process. Recruiter names include - ${recruiterNamesString}`,
            response_format: 'verbose_json',     // for word-level timestamps
            timestamp_granularities: ['segment', 'word']
        });

        console.log(`Transcription successful`);
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