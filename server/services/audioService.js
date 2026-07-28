import fs from "fs";
import path from "path";
import os from "os";
import axios from 'axios';
import ffmpeg from "fluent-ffmpeg";
import { randomUUID } from "crypto";    // needed for temp mp3 filename
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const downloadAudio = async (audioURL, destinationPath) => {
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
        filePath: tempFilePath,
        isDownloaded: isDownloaded,
        targetDir: tempDir
    };
}

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