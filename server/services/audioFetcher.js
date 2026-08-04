import axios from "axios";
import fs from "fs";
import path from "path";
import { viewToDownloadDriveLink } from "./googleFileURLService.js";

/*  @param apiURL - company URL for the recordings API  */
export const fetchAndDownloadAudioChunks = async (apiURL) => {
    try {
        // 1. get API response and verify the expected API response structure before proceeding (guardrail)
        // Added a 10-second timeout here as well, just in case the initial API is unresponsive.
        const response = await axios.get(apiURL, { timeout: 10000 });
        const data = response.data;

        if(!data || !data.data || !data.success || !data.data[0] || !data.data[0].chunks) {
            // if no response data, invalid structure, no audio chunks, no data field in response data
            return {
                isError: true,
                content: [
                    {
                        type: 'text',
                        text: "Invalid API response structure - [audio clips unavailable / response empty / unknown response format]"
                    }
                ]
            }
        }
        // Grab the chunks array ( contains audio clips' Google Drive links ) - inspect the API response to get the appropriate way to extract the audio chunks array
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
                        responseType: "stream",
                        timeout: 20000      // safeguard to timeout a failed get request to the audio-chunk url (Google Drive)
                    }); // 20 seconds limit for each audio chunk to download, else all downloads will be failed and removed

                    fileResponse.data.pipe(fileWriter);

                    fileWriter.on("finish", () => resolve(fileName));

                    // In case the download stream breaks, this 'error' event listener will clean up partially downloaded files to prevent disk and RAM clogging
                    fileWriter.on("error", err => {
                        fs.unlink(fileName, () => {});      // cleanup the partially downloaded file
                        reject(err);
                    });

                } catch (error) {
                    // catch all AXIOS's timeout errors
                    reject(error);
                }
            });
        });

        console.log(`Downloading ${audioChunks.length} audio chunks in parallel....\n`);

        // 4. Execute all the downloads in parallel using `Promise.all(promises)` - if any download promise fails (due to timeout), Promise.all() will fail early and throw an error to the outer catch block
        const localFilePaths = await Promise.all(downloadPromises);

        console.log("All chunks downloaded successfully.");
        return localFilePaths;
    } catch (error) {
        console.error("Failed to fetch and download chunks:", error.message);
        throw error;
    }
}