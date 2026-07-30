import fs from "fs";
import path from "path";
import os from "os";
import axios from 'axios';
import ffmpeg from "fluent-ffmpeg";
import { randomUUID } from "crypto";    // needed for temp mp3 filename
import Groq from 'groq-sdk';

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

        // call the groq API for transcription
        let transcription = await groq.audio.transcriptions.create({
            file: audioFile,
            model: 'whisper-large-v3-turbo',
            // this prompt gives whisper some vocabulary context to expect in the audio files
            prompt: `Interview transcript for 'BiziBees'. Recruitment, BPO, customer support, human resources, candidate, salary, notice period, shift, voice process. Recruiter names include - Hajira, Ayesha`,
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