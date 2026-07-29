export const viewToDownloadDriveLink = (fileUrl) => {
    // 1. Clean the URL (remove accidental markdown brackets, quotes, or hidden spaces)
    fileUrl = fileUrl.replace(/[<>[\]()\"\']/g, '').trim();

    // 2. Automatically convert Google Drive 'view' links to direct 'download' links
    const driveRegex = /\/file\/d\/([a-zA-Z0-9_-]+)/;
    const match = fileUrl.match(driveRegex);
    if (match && match[1]) {
        const fileId = match[1];
        fileUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    }

    console.log(fileUrl);
    return fileUrl;
}