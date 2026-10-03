/*
========================================
MOVIELITE BACKEND
INTERNET ARCHIVE DOWNLOAD STREAM
========================================

Purpose:
- Accept a MovieLite Internet Archive identifier + file name
- Verify the item belongs to opensource_movies
- Verify the requested file is a video
- Fetch the file server-side
- Stream it directly to the browser
- Support HTTP Range requests
- Force browser downloads with Content-Disposition

This is intentionally NOT a generic URL proxy.
The client cannot provide an arbitrary upstream URL.
*/


const ARCHIVE_API = "https://archive.org";


/*
========================================
CORS
========================================
*/

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Range, Content-Type",
        "Access-Control-Expose-Headers":
            "Accept-Ranges, Content-Length, Content-Range, " +
            "Content-Type, Content-Disposition, ETag, Last-Modified",
        "Access-Control-Max-Age": "86400"
    };
}


/*
========================================
JSON RESPONSE
========================================
*/

function jsonResponse(data, status = 200) {

    const headers = new Headers({
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });

    const cors = corsHeaders();

    for (const [key, value] of Object.entries(cors)) {
        headers.set(key, value);
    }

    return new Response(
        JSON.stringify(data),
        {
            status,
            headers
        }
    );
}


/*
========================================
VIDEO FILE CHECK
========================================
*/

function isVideoFile(file) {

    if (!file || typeof file.name !== "string") {
        return false;
    }

    const name = file.name.toLowerCase();

    const extensions = [
        ".mp4",
        ".webm",
        ".m4v",
        ".ogv",
        ".mov"
    ];

    if (extensions.some(ext => name.endsWith(ext))) {
        return true;
    }

    const format = String(file.format || "").toLowerCase();

    const formats = [
        "mpeg4",
        "h.264",
        "h264",
        "webm",
        "ogg video",
        "quicktime"
    ];

    return formats.some(value => format.includes(value));
}


/*
========================================
COLLECTION CHECK
========================================
*/

function belongsToOpenSourceMovies(metadata) {

    const collection = metadata?.collection;

    if (!collection) {
        return false;
    }

    if (typeof collection === "string") {
        return collection
            .split(/\s+/)
            .includes("opensource_movies");
    }

    if (Array.isArray(collection)) {
        return collection.includes("opensource_movies");
    }

    if (typeof collection === "object") {

        return Object.values(collection)
            .flat(Infinity)
            .some(value =>
                String(value) === "opensource_movies"
            );
    }

    return false;
}


/*
========================================
FILE NAME VALIDATION
========================================
*/

function isSafeFileName(filename) {

    if (!filename) {
        return false;
    }

    if (filename.length > 500) {
        return false;
    }

    /*
    Prevent path traversal.
    Archive filenames may contain directories,
    so only "." and ".." path components are rejected.
    */

    const parts = filename.split("/");

    for (const part of parts) {

        if (part === "." || part === "..") {
            return false;
        }
    }

    /*
    Reject control characters.
    */

    if (/[\u0000-\u001F\u007F]/.test(filename)) {
        return false;
    }

    return true;
}


/*
========================================
IDENTIFIER VALIDATION
========================================
*/

function isSafeIdentifier(identifier) {

    if (!identifier) {
        return false;
    }

    if (identifier.length > 200) {
        return false;
    }

    /*
    Internet Archive identifiers should not contain
    URL control characters or path traversal.
    */

    if (
        identifier.includes("/") ||
        identifier.includes("\\") ||
        identifier.includes("..") ||
        /[\u0000-\u001F\u007F]/.test(identifier)
    ) {
        return false;
    }

    return true;
}


/*
========================================
DOWNLOAD FILE NAME
========================================
*/

function getDownloadName(filename) {

    const parts = filename.split("/");

    let name = parts[parts.length - 1];

    if (!name) {
        name = "movie-video";
    }

    /*
    Remove characters that are unsafe in
    Content-Disposition filenames.
    */

    name = name
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/"/g, "")
        .replace(/\\/g, "")
        .trim();

    if (!name) {
        name = "movie-video";
    }

    return name;
}


/*
========================================
ARCHIVE FILE URL
========================================
*/

function buildArchiveFileUrl(identifier, filename) {

    const encodedIdentifier =
        encodeURIComponent(identifier);

    const encodedFilename =
        filename
            .split("/")
            .map(part => encodeURIComponent(part))
            .join("/");

    return (
        `${ARCHIVE_API}/download/` +
        `${encodedIdentifier}/` +
        `${encodedFilename}`
    );
}


/*
========================================
COPY UPSTREAM HEADERS
========================================
*/

function copyResponseHeaders(upstream) {

    const headers = new Headers();

    const allowedHeaders = [
        "Content-Type",
        "Content-Length",
        "Content-Range",
        "Accept-Ranges",
        "ETag",
        "Last-Modified"
    ];

    for (const name of allowedHeaders) {

        const value = upstream.headers.get(name);

        if (value !== null) {
            headers.set(name, value);
        }
    }

    return headers;
}


/*
========================================
DOWNLOAD HANDLER
========================================
*/

async function handleDownload(request) {

    const requestUrl = new URL(request.url);

    const identifier =
        requestUrl.searchParams.get("identifier");

    const filename =
        requestUrl.searchParams.get("file");


    /*
    ------------------------------------
    Validate parameters
    ------------------------------------
    */

    if (!isSafeIdentifier(identifier)) {

        return jsonResponse(
            {
                error: "Invalid or missing Internet Archive identifier."
            },
            400
        );
    }


    if (!isSafeFileName(filename)) {

        return jsonResponse(
            {
                error: "Invalid or missing file name."
            },
            400
        );
    }


    /*
    ------------------------------------
    Get Internet Archive metadata
    ------------------------------------
    */

    const metadataUrl =
        `${ARCHIVE_API}/metadata/` +
        encodeURIComponent(identifier);

    let metadataResponse;

    try {

        metadataResponse = await fetch(
            metadataUrl,
            {
                method: "GET"
            }
        );

    } catch (error) {

        return jsonResponse(
            {
                error: "Could not contact Internet Archive."
            },
            502
        );
    }


    if (!metadataResponse.ok) {

        return jsonResponse(
            {
                error: "Internet Archive item was not found."
            },
            404
        );
    }


    let metadata;

    try {

        metadata = await metadataResponse.json();

    } catch (error) {

        return jsonResponse(
            {
                error: "Invalid metadata response."
            },
            502
        );
    }


    /*
    ------------------------------------
    Make sure this is an authorized
    MovieLite source collection.
    ------------------------------------
    */

    if (!belongsToOpenSourceMovies(metadata)) {

        return jsonResponse(
            {
                error:
                    "This item is not part of the MovieLite " +
                    "authorized movie collection."
            },
            403
        );
    }


    /*
    ------------------------------------
    Find requested file
    ------------------------------------
    */

    const files = Array.isArray(metadata.files)
        ? metadata.files
        : [];

    const file = files.find(
        entry => entry?.name === filename
    );


    if (!file) {

        return jsonResponse(
            {
                error: "Requested file was not found."
            },
            404
        );
    }


    /*
    ------------------------------------
    Only allow video files
    ------------------------------------
    */

    if (!isVideoFile(file)) {

        return jsonResponse(
            {
                error: "Requested file is not a supported video file."
            },
            400
        );
    }


    /*
    ------------------------------------
    Build trusted Archive URL
    ------------------------------------
    */

    const archiveFileUrl =
        buildArchiveFileUrl(
            identifier,
            filename
        );


    /*
    ------------------------------------
    Forward Range request
    ------------------------------------
    */

    const upstreamHeaders = new Headers();

    const range =
        request.headers.get("Range");

    if (range) {
        upstreamHeaders.set(
            "Range",
            range
        );
    }


    /*
    ------------------------------------
    Fetch movie from Internet Archive
    ------------------------------------
    */

    let upstream;

    try {

        upstream = await fetch(
            archiveFileUrl,
            {
                method: "GET",
                headers: upstreamHeaders,
                redirect: "follow"
            }
        );

    } catch (error) {

        return jsonResponse(
            {
                error:
                    "Could not retrieve the movie file."
            },
            502
        );
    }


    /*
    ------------------------------------
    Accept:
    200 = normal file
    206 = partial/range response
    ------------------------------------
    */

    if (
        !upstream.ok &&
        upstream.status !== 206
    ) {

        return jsonResponse(
            {
                error:
                    "Internet Archive could not provide " +
                    "the requested video file.",
                status: upstream.status
            },
            502
        );
    }


    /*
    ------------------------------------
    Build response headers
    ------------------------------------
    */

    const responseHeaders =
        copyResponseHeaders(upstream);


    /*
    Force browser download.
    */

    const downloadName =
        getDownloadName(filename);

    responseHeaders.set(
        "Content-Disposition",
        `attachment; filename="${downloadName}"`
    );


    /*
    Prevent stale download responses.
    */

    responseHeaders.set(
        "Cache-Control",
        "no-store"
    );


    /*
    Add CORS headers.
    */

    const cors = corsHeaders();

    for (const [key, value] of Object.entries(cors)) {
        responseHeaders.set(key, value);
    }


    /*
    ------------------------------------
    STREAM RESPONSE
    ------------------------------------

    IMPORTANT:
    upstream.body is passed directly into
    the Worker response.

    The entire movie is NOT loaded into
    Worker memory first.
    */

    return new Response(
        upstream.body,
        {
            status: upstream.status,
            headers: responseHeaders
        }
    );
}


/*
========================================
MAIN WORKER
========================================
*/

export default {

    async fetch(request) {

        const url =
            new URL(request.url);


        /*
        --------------------------------
        CORS preflight
        --------------------------------
        */

        if (request.method === "OPTIONS") {

            return new Response(
                null,
                {
                    status: 204,
                    headers: corsHeaders()
                }
            );
        }


        /*
        --------------------------------
        Only GET is supported
        --------------------------------
        */

        if (request.method !== "GET") {

            return jsonResponse(
                {
                    error: "Method not allowed."
                },
                405
            );
        }


        /*
        --------------------------------
        API route
        --------------------------------
        */

        if (
            url.pathname === "/api/download"
        ) {

            return handleDownload(request);
        }


        /*
        --------------------------------
        Health check
        --------------------------------
        */

        if (
            url.pathname === "/api/health"
        ) {

            return jsonResponse(
                {
                    ok: true,
                    service: "MovieLite Backend"
                }
            );
        }


        /*
        --------------------------------
        Unknown route
        --------------------------------
        */

        return jsonResponse(
            {
                error: "MovieLite API route not found."
            },
            404
        );
    }
};