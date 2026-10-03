/*
========================================
MOVIELITE
========================================

Current provider:
Internet Archive - Open Source Movies

The provider is isolated so additional
authorized providers can be added later.
========================================
*/

window.onerror = function (
    message,
    source,
    line,
    column,
    error
) {
    alert(
        "MovieLite JavaScript Error\n\n" +
        message +
        "\n\nLine: " +
        line +
        "\nColumn: " +
        column
    );
};

const API_BASE = "https://archive.org";

const state = {
    results: [],
    currentMovie: null,
    library: loadLibrary(),
    searchRequest: null
};

/*
========================================
DOM
========================================
*/

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const searchSection = document.getElementById("searchSection");
const browseSection = document.getElementById("browseSection");
const results = document.getElementById("results");
const resultsTitle = document.getElementById("resultsTitle");
const statusElement = document.getElementById("status");
const detailsSection = document.getElementById("detailsSection");
const detailsContent = document.getElementById("detailsContent");
const playerSection = document.getElementById("playerSection");
const videoPlayer = document.getElementById("videoPlayer");
const playerTitle = document.getElementById("playerTitle");
const librarySection = document.getElementById("librarySection");
const libraryElement = document.getElementById("library");

/*
========================================
EVENTS
========================================
*/

searchForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const query = searchInput.value.trim();

    if (!query) {
        return;
    }

    searchMovies(query);
});

document.getElementById("backButton").addEventListener("click", showHome);
document.getElementById("libraryButton").addEventListener("click", showLibrary);
document.getElementById("closeLibraryButton").addEventListener("click", showHome);
document.getElementById("closePlayerButton").addEventListener("click", closePlayer);

/*
========================================
SEARCH
========================================
*/

async function searchMovies(query) {
    setStatus("Searching for \"" + query + "\"...");

    results.innerHTML = "";
    showHome();

    resultsTitle.textContent = "Search results";

    const params = new URLSearchParams();

    params.set(
        "q",
        "collection:opensource_movies AND mediatype:movies AND title:(" + query + ")"
    );

    [
        "identifier",
        "title",
        "description",
        "date",
        "year",
        "creator",
        "subject",
        "mediatype"
    ].forEach(function (field) {
        params.append("fl[]", field);
    });

    params.set("rows", "40");
    params.set("page", "1");
    params.set("output", "json");

    const url = API_BASE + "/advancedsearch.php?" + params.toString();

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Search request failed: " + response.status);
        }

        const data = await response.json();

        state.results = (data.response && data.response.docs) || [];

        if (state.results.length === 0) {
            setStatus("No results found.");
            results.innerHTML = "<div class=\"empty\">No movies were found.</div>";
            return;
        }

        setStatus(state.results.length + " result(s) found.");
        renderResults(state.results);
    } catch (error) {
        console.error(error);
        setStatus("Search failed. Check your internet connection and try again.");
    }
}

/*
========================================
RESULTS
========================================
*/

function renderResults(movies) {
    results.innerHTML = "";

    movies.forEach(function (movie) {
        const card = document.createElement("article");
        card.className = "movie-card";

        const identifier = movie.identifier;
        const title = movie.title || identifier;
        const year = movie.year || extractYear(movie.date);
        const poster = getPoster(identifier);

        card.innerHTML =
            (poster
                ? "<img class=\"movie-poster\" src=\"" + escapeAttribute(poster) + "\" alt=\"\" loading=\"lazy\">"
                : "<div class=\"no-poster\">No poster available</div>") +
            "<div class=\"movie-info\">" +
                "<h3 class=\"movie-title\">" + escapeHTML(title) + "</h3>" +
                "<div class=\"movie-meta\">" + escapeHTML(year || "Unknown year") + "</div>" +
                "<button class=\"card-button\" type=\"button\">Open</button>" +
            "</div>";

        card.querySelector(".card-button").addEventListener("click", function (event) {
            event.preventDefault();
            openMovie(movie);
        });

        results.appendChild(card);
    });
}

/*
========================================
OPEN MOVIE
========================================
*/

async function openMovie(movie) {
    if (!movie || !movie.identifier) {
        setStatus("This result has no identifier, so it cannot be opened.");
        return;
    }

    state.currentMovie = movie;

    hideSections();
    searchSection.classList.add("hidden");
    browseSection.classList.add("hidden");
    statusElement.classList.add("hidden");

    detailsSection.classList.remove("hidden");
    detailsSection.scrollIntoView({ behavior: "smooth", block: "start" });

    const title = movie.title || movie.identifier || "Unknown movie";
    const year = movie.year || extractYear(movie.date) || "Unknown year";
    const poster = getPoster(movie.identifier);
    const description = cleanDescription(movie.description) || "No description available.";

    detailsContent.innerHTML =
        "<div class=\"details-layout\">" +
            "<div>" +
                (poster
                    ? "<img class=\"details-poster\" src=\"" + escapeAttribute(poster) + "\" alt=\"\">"
                    : "<div class=\"no-poster\">No poster available</div>") +
            "</div>" +
            "<div>" +
                "<h1>" + escapeHTML(title) + "</h1>" +
                "<div class=\"movie-meta\">" + escapeHTML(year) + "</div>" +
                "<p class=\"description\">" + escapeHTML(description) + "</p>" +
                "<div class=\"source-list\">" +
                    "<h2>Available files</h2>" +
                    "<div id=\"sourceStatus\">Looking up video files...</div>" +
                    "<div id=\"sources\"></div>" +
                "</div>" +
            "</div>" +
        "</div>";

    // This call was missing. Open only painted the page and never
    // asked Internet Archive for the actual video files.
    await loadMovieSources(movie.identifier);
}

/*
========================================
SOURCE DISCOVERY
========================================
*/

async function loadMovieSources(identifier) {
    const sourceStatus = document.getElementById("sourceStatus");
    const sourcesElement = document.getElementById("sources");

    if (!sourceStatus || !sourcesElement) {
        return;
    }

    try {
        const response = await fetch(
            API_BASE + "/metadata/" + encodeURIComponent(identifier)
        );

        if (!response.ok) {
            throw new Error("Metadata request failed");
        }

        const metadata = await response.json();
        const files = metadata.files || [];
        const videoFiles = files.filter(isVideoFile).sort(compareVideoFiles);

        if (videoFiles.length === 0) {
            sourceStatus.textContent = "No directly playable video file was found.";
            return;
        }

        sourceStatus.textContent = videoFiles.length + " video file(s) available.";
        sourcesElement.innerHTML = "";

        videoFiles.forEach(function (file) {
            renderSource(identifier, file, sourcesElement);
        });
    } catch (error) {
        console.error(error);
        sourceStatus.textContent = "Could not inspect this movie.";
    }
}

/*
========================================
VIDEO FILE DETECTION
========================================
*/

function compareVideoFiles(a, b) {
    return Number(b.size || 0) - Number(a.size || 0);
}

function isVideoFile(file) {
    const name = String(file.name || "").toLowerCase();
    const format = String(file.format || "").toLowerCase();

    if (name.endsWith(".torrent") || name.indexOf("__ia_thumb") !== -1) {
        return false;
    }

    const videoExtensions = [".mp4", ".webm", ".m4v", ".ogv", ".mov"];
    const videoFormats = ["mpeg4", "h.264", "h264", "webm", "ogg video", "quicktime"];

    return (
        videoExtensions.some(function (extension) {
            return name.endsWith(extension);
        }) ||
        videoFormats.some(function (item) {
            return format.indexOf(item) !== -1;
        })
    );
}

/*
========================================
SOURCE UI
========================================
*/

function renderSource(identifier, file, container) {
    const url = buildDownloadURL(identifier, file.name);
    const size = formatBytes(Number(file.size || 0));
    const source = document.createElement("div");

    source.className = "source";
    source.innerHTML =
        "<div class=\"source-name\">" + escapeHTML(file.name) + "</div>" +
        "<div class=\"source-meta\">" +
            escapeHTML(file.format || "Video") +
            (size ? " • " + size : "") +
        "</div>" +
        "<div class=\"source-actions\">" +
            "<button class=\"watch-button\" type=\"button\">Watch</button>" +
            "<a href=\"" + escapeAttribute(url) + "\" download target=\"_blank\" rel=\"noopener\">Download</a>" +
        "</div>";

    source.querySelector(".watch-button").addEventListener("click", function () {
        playMovie(
            url,
            (state.currentMovie && state.currentMovie.title) || identifier
        );
    });

    container.appendChild(source);
}

/*
========================================
PLAYER
========================================
*/

function playMovie(url, title) {
    hideSections();
    searchSection.classList.add("hidden");
    browseSection.classList.add("hidden");
    statusElement.classList.add("hidden");

    playerSection.classList.remove("hidden");
    playerSection.scrollIntoView({ behavior: "smooth", block: "start" });

    playerTitle.textContent = title;
    videoPlayer.src = url;
    videoPlayer.load();

    videoPlayer.play().catch(function () {
        // Some browsers wait for the user to press play.
    });

    rememberWatched(state.currentMovie);
}

function closePlayer() {
    videoPlayer.pause();
    videoPlayer.removeAttribute("src");
    videoPlayer.load();

    if (state.currentMovie) {
        openMovie(state.currentMovie);
        return;
    }

    showHome();
}

/*
========================================
LIBRARY
========================================
*/

function showLibrary() {
    hideSections();
    searchSection.classList.add("hidden");
    browseSection.classList.add("hidden");
    statusElement.classList.add("hidden");

    librarySection.classList.remove("hidden");
    librarySection.scrollIntoView({ behavior: "smooth", block: "start" });
    renderLibrary();
}

function renderLibrary() {
    libraryElement.innerHTML = "";

    if (!state.library || state.library.length === 0) {
        libraryElement.innerHTML = "<div class=\"empty\">Your library is empty.</div>";
        return;
    }

    state.library.forEach(function (movie) {
        const card = document.createElement("article");
        card.className = "movie-card";

        const poster = getPoster(movie.identifier);

        card.innerHTML =
            (poster
                ? "<img class=\"movie-poster\" src=\"" + escapeAttribute(poster) + "\" alt=\"\" loading=\"lazy\">"
                : "<div class=\"no-poster\">No poster</div>") +
            "<div class=\"movie-info\">" +
                "<h3 class=\"movie-title\">" + escapeHTML(movie.title) + "</h3>" +
                "<button class=\"card-button\" type=\"button\">Open</button>" +
            "</div>";

        card.querySelector(".card-button").addEventListener("click", function () {
            openMovie(movie);
        });

        libraryElement.appendChild(card);
    });
}

function rememberWatched(movie) {
    if (!movie || !movie.identifier) {
        return;
    }

    const item = {
        identifier: movie.identifier,
        title: movie.title || movie.identifier,
        year: movie.year || extractYear(movie.date),
        watchedAt: Date.now()
    };

    state.library = state.library.filter(function (existing) {
        return existing.identifier !== item.identifier;
    });

    state.library.unshift(item);
    state.library = state.library.slice(0, 100);
    saveLibrary();
}

/*
========================================
LIBRARY STORAGE
========================================
*/

function loadLibrary() {
    try {
        const raw = localStorage.getItem("movielite-library");

        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function saveLibrary() {
    try {
        localStorage.setItem("movielite-library", JSON.stringify(state.library));
    } catch (error) {
        console.error("Could not save library", error);
    }
}

/*
========================================
POSTERS
========================================
*/

function getPoster(identifier) {
    if (!identifier) {
        return null;
    }

    return API_BASE + "/services/img/" + encodeURIComponent(identifier);
}

/*
========================================
DOWNLOAD URL
========================================
*/

function buildDownloadURL(identifier, filename) {
    return (
        API_BASE + "/download/" +
        encodeURIComponent(identifier) + "/" +
        String(filename)
            .split("/")
            .map(function (part) {
                return encodeURIComponent(part);
            })
            .join("/")
    );
}

/*
========================================
NAVIGATION
========================================
*/

function hideSections() {
    detailsSection.classList.add("hidden");
    playerSection.classList.add("hidden");
    librarySection.classList.add("hidden");
}

function showHome() {
    hideSections();
    searchSection.classList.remove("hidden");
    browseSection.classList.remove("hidden");
    statusElement.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

/*
========================================
STATUS
========================================
*/

function setStatus(message) {
    statusElement.textContent = message;
}

/*
========================================
UTILITIES
========================================
*/

function extractYear(date) {
    if (!date) {
        return "";
    }

    const match = String(date).match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : "";
}

function cleanDescription(description) {
    if (!description) {
        return "";
    }

    if (typeof description === "string") {
        return description;
    }

    if (Array.isArray(description)) {
        return description.join(" ");
    }

    return String(description);
}

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) {
        return "";
    }

    const units = ["B", "KB", "MB", "GB"];
    let index = 0;
    let value = bytes;

    while (value >= 1024 && index < units.length - 1) {
        value /= 1024;
        index++;
    }

    return value.toFixed(value >= 10 ? 0 : 1) + " " + units[index];
}

function escapeHTML(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&")
        .replace(/</g, "<")
        .replace(/>/g, ">")
        .replace(/"/g, """)
        .replace(/'/g, "&#039;");
}

function escapeAttribute(value) {
    return escapeHTML(value);
}
