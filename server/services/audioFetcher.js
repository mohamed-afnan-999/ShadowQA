import axios from "axios";
import fs from "fs";
import path from "path";
import { viewToDownloadDriveLink } from "./googleFileURLService.js";

/*  @param apiURL - company URL for the recordings API  */
export const fetchAndDownloadAudioChunks = async (apiURL) => {
    try {
        // 1. get API response and verify the expected API response structure before proceeding (guardrail)
        const response = await axios.get(apiURL);
        const data = response.data;

        if(!data || !data.data || !data.success || !data.data[0] || !data.data[0].chunks) {
            // if no response data, invalid structure, no audio chunks, no data field in response data
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: "Invalid API response structure - [audio clips unavailable, response empty, unknown response format]"
                    }
                ]
            }
        }
        // Grab the chunks array ( contains audio clips' Google Drive links )
        const audioChunks = data.data[0].chunks;

        // 2. Create a temporary directory
        const tempDir = path.resolve("../temp_audio");
        if(!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        // 3. Map over each chunk to a download promise
        const downloadPromises = audioChunks.map((audioChunk, index) => {
            return new Promise(async (resolve, reject) => {
                try {
                    // clean the audio chunk URL for download
                    const downloadURL = viewToDownloadDriveLink(audioChunk.url);

                    // Name the target filepath
                    const fileName = path.join(tempDir, `chunk_${index}.mp3`);

                    // create a filesystem writer
                    const fileWriter = fs.createWriteStream(fileName);

                    // download the audio file using 'axios' and pipe the output to the target file
                    const fileResponse = await axios({
                        method: "GET",
                        url: downloadURL,
                        responseType: "stream"
                    })

                    fileResponse.data.pipe(fileWriter);

                    fileWriter.on("finish", () => resolve(fileName));
                    fileWriter.on("error", reject);
                } catch (error) {
                    reject(error);
                }
            });
        });

        console.log(`Downloading ${audioChunks.length} audio chunks in parallel....\n`);

        // 4. Execute all the downloads in parallel using `Promise.all(promises)`
        const localFilePaths = await Promise.all(downloadPromises);

        console.log("All chunks downloaded successfully.");
        return localFilePaths;
    } catch (error) {
        console.error("Failed to fetch and download chunks:", error.message);
        throw error;
    }
}