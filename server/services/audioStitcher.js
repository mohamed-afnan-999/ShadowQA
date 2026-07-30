import ffmpeg from "fluent-ffmpeg";
import fs from 'fs';
import path from 'path';

export const stitchAudioChunks = (filepaths) => {
    return new Promise((resolve, reject) => {

        // Verify the filepaths exist
        if(!filepaths || filepaths.length === 0) {
            return reject(new Error("No audio files provided to stitch."));
        }

        // Add the chunks file in sequence to the 'ffmpeg()' command
        const command = ffmpeg();
        filepaths.forEach(filepath => command.input(filepath))

        // Target/Destination folder for master audio files - /server/full_recordings
        const destinationPath = path.resolve(process.cwd(), 'full_recordings');
        if(!fs.existsSync(destinationPath))
            fs.mkdirSync(destinationPath, {recursive: true});

        const targetFilePath = path.join(destinationPath, `master_audio_${Date.now()}.mp3`);

        console.log(`Stitching ${filepaths.length} audio chunks together...`);

        command
            .on('error', error => {
                console.error(`FFmpeg Error: ${error.message}.`);
                reject(error);
            })
            .on('end', () => {
                console.log('Audio stitching complete.');
                resolve(targetFilePath);
            })
            .mergeToFile(targetFilePath, destinationPath);      // target file path and target dir to put this new file into
    });
}
