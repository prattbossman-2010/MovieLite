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

const API_BASE =
    "https://archive.org";


/*
========================================
STATE
========================================
*/

const state = {

    results: [],

    currentMovie: null,

    library: loadLibrary(),

    searchRequest: null,

    previousScreen: "home"

};


/*
========================================
DOM
========================================
*/

const searchForm =
    document.getElementById("searchForm");

const searchInput =
    document.getElementById("searchInput");

const results =
    document.getElementById("results");

const resultsTitle =
    document.getElementById("resultsTitle");

const statusElement =
    document.getElementById("status");

const detailsSection =
    document.getElementById("detailsSection");

const detailsContent =
    document.getElementById("detailsContent");

const playerSection =
    document.getElementById("playerSection");

const videoPlayer =
    document.getElementById("videoPlayer");

const playerTitle =
    document.getElementById("playerTitle");

const librarySection =
    document.getElementById("librarySection");

const libraryElement =
    document.getElementById("library");

const searchSection =
    document.querySelector(".search-section");

const resultsSection =
    results?.closest("section");


/*
========================================
EVENTS
========================================
*/

searchForm.addEventListener(
    "submit",
    function (event) {

        event.preventDefault();

        const query =
            searchInput.value.trim();

        if (!query) {
            return;
        }

        searchMovies(query);

    }
);


document
    .getElementById("backButton")
    .addEventListener(
        "click",
        showHome
    );


document
    .getElementById("libraryButton")
    .addEventListener(
        "click",
        showLibrary
    );


document
    .getElementById("closeLibraryButton")
    .addEventListener(
        "click",
        showHome
    );


document
    .getElementById("closePlayerButton")
    .addEventListener(
        "click",
        closePlayer
    );


/*
========================================
SEARCH
========================================
*/

async function searchMovies(query) {

    state.previousScreen = "home";

    state.currentMovie = null;

    showHome();

    setStatus(
        `Searching for "${query}"...`
    );

    results.innerHTML = "";

    resultsTitle.textContent =
        "Search results";


    const params =
        new URLSearchParams({

            q:
                `collection:opensource_movies AND title:(${query})`,

            "fl[]":
                [
                    "identifier",
                    "title",
                    "description",
                    "date",
                    "year",
                    "creator",
                    "subject",
                    "mediatype"
                ],

            rows: "40",

            page: "1",

            output: "json"

        });


    const url =
        `${API_BASE}/advancedsearch.php?${params.toString()}`;


    try {

        const response =
            await fetch(url);


        if (!response.ok) {

            throw new Error(
                "Search request failed: " +
                response.status
            );

        }


        const data =
            await response.json();


        state.results =
            data.response?.docs || [];


        if (
            state.results.length === 0
        ) {

            setStatus(
                "No results found."
            );

            results.innerHTML =
                `
                <div class="empty">
                    No movies were found.
                </div>
                `;

            return;

        }


        setStatus(
            `${state.results.length} result(s) found.`
        );


        renderResults(
            state.results
        );


    } catch (error) {

        console.error(
            "MovieLite search error:",
            error
        );

        setStatus(
            "Search failed. Check your internet connection and try again."
        );

        results.innerHTML =
            `
            <div class="empty">
                Search failed.
            </div>
            `;

    }

}


/*
========================================
RESULTS
========================================
*/

function renderResults(movies) {

    results.innerHTML = "";


    movies.forEach(
        function (movie) {

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "movie-card";


            const identifier =
                movie.identifier;


            const title =
                movie.title ||
                identifier ||
                "Unknown movie";


            const year =
                movie.year ||
                extractYear(
                    movie.date
                );


            const poster =
                getPoster(
                    identifier
                );


            card.innerHTML = `

                ${
                    poster

                    ?

                    `<img
                        class="movie-poster"
                        src="${escapeAttribute(poster)}"
                        alt=""
                        loading="lazy"
                    >`

                    :

                    `<div class="no-poster">
                        No poster available
                    </div>`
                }

                <div class="movie-info">

                    <h3 class="movie-title">
                        ${escapeHTML(title)}
                    </h3>

                    <div class="movie-meta">
                        ${escapeHTML(
                            year ||
                            "Unknown year"
                        )}
                    </div>

                    <button
                        class="card-button"
                    >
                        Open
                    </button>

                </div>

            `;


            card
                .querySelector(
                    ".card-button"
                )
                .addEventListener(
                    "click",
                    function () {

                        openMovie(
                            movie
                        );

                    }
                );


            results.appendChild(
                card
            );

        }
    );

}


/*
========================================
OPEN MOVIE
========================================
*/

function openMovie(movie) {

    state.currentMovie =
        movie;

    state.previousScreen =
        "details";


    hideSections();


    if (searchSection) {

        searchSection.classList.add(
            "hidden"
        );

    }


    if (resultsSection) {

        resultsSection.classList.add(
            "hidden"
        );

    }


    statusElement.classList.add(
        "hidden"
    );


    detailsSection.classList.remove(
        "hidden"
    );


    const title =
        movie.title ||
        movie.identifier ||
        "Unknown movie";


    const year =
        movie.year ||
        extractYear(
            movie.date
        ) ||
        "Unknown year";


    const poster =
        getPoster(
            movie.identifier
        );


    const description =
        cleanDescription(
            movie.description
        ) ||
        "No description available.";


    detailsContent.innerHTML = `

        <div class="details-layout">

            <div>

                ${
                    poster

                    ?

                    `<img
                        class="details-poster"
                        src="${escapeAttribute(poster)}"
                        alt=""
                    >`

                    :

                    `<div class="no-poster">
                        No poster available
                    </div>`
                }

            </div>


            <div>

                <h1>
                    ${escapeHTML(title)}
                </h1>


                <div class="movie-meta">
                    ${escapeHTML(year)}
                </div>


                <p class="description">
                    ${escapeHTML(
                        description
                    )}
                </p>


                <div class="source-list">

                    <h2>
                        Available files
                    </h2>


                    <div id="sourceStatus">
                        Finding available video files...
                    </div>


                    <div id="sources"></div>

                </div>

            </div>

        </div>

    `;


    detailsSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });


    loadMovieSources(
        movie.identifier
    );

}


/*
========================================
SOURCE DISCOVERY
========================================
*/

async function loadMovieSources(
    identifier
) {

    const sourceStatus =
        document.getElementById(
            "sourceStatus"
        );


    const sourcesElement =
        document.getElementById(
            "sources"
        );


    if (
        !sourceStatus ||
        !sourcesElement
    ) {
        return;
    }


    sourceStatus.textContent =
        "Finding available video files...";


    sourcesElement.innerHTML =
        "";


    try {

        const response =
            await fetch(
                `${API_BASE}/metadata/${encodeURIComponent(identifier)}`
            );


        if (!response.ok) {

            throw new Error(
                "Metadata request failed: " +
                response.status
            );

        }


        const metadata =
            await response.json();


        const files =
            metadata.files || [];


        const videoFiles =
            files
                .filter(isVideoFile)
                .sort(compareVideoFiles);


        if (
            videoFiles.length === 0
        ) {

            sourceStatus.textContent =
                "No directly downloadable video file was found.";

            return;

        }


        sourceStatus.textContent =
            `${videoFiles.length} video file(s) available.`;


        videoFiles.forEach(
            function (file) {

                renderSource(
                    identifier,
                    file,
                    sourcesElement
                );

            }
        );


    } catch (error) {

        console.error(
            "MovieLite source discovery error:",
            error
        );


        sourceStatus.textContent =
            "Could not inspect this movie.";

    }

}


/*
========================================
VIDEO FILE DETECTION
========================================
*/

function compareVideoFiles(
    a,
    b
) {

    const sizeA =
        Number(
            a.size || 0
        );


    const sizeB =
        Number(
            b.size || 0
        );


    return sizeB - sizeA;

}


function isVideoFile(file) {

    const name =
        String(
            file.name || ""
        ).toLowerCase();


    const format =
        String(
            file.format || ""
        ).toLowerCase();


    const videoExtensions = [

        ".mp4",
        ".webm",
        ".m4v",
        ".ogv",
        ".mov"

    ];


    const videoFormats = [

        "mpeg4",
        "h.264",
        "h264",
        "webm",
        "ogg video",
        "quicktime"

    ];


    return (

        videoExtensions.some(
            function (extension) {

                return name.endsWith(
                    extension
                );

            }
        )

        ||

        videoFormats.some(
            function (item) {

                return format.includes(
                    item
                );

            }
        )

    );

}


/*
========================================
SOURCE UI
========================================
*/

function renderSource(
    identifier,
    file,
    container
) {

    const url =
        buildDownloadURL(
            identifier,
            file.name
        );


    const size =
        formatBytes(
            Number(
                file.size || 0
            )
        );


    const source =
        document.createElement(
            "div"
        );


    source.className =
        "source";


    source.innerHTML = `

        <div class="source-name">
            ${escapeHTML(
                file.name
            )}
        </div>


        <div class="source-meta">

            ${escapeHTML(
                file.format ||
                "Video"
            )}

            ${
                size
                ? " • " + size
                : ""
            }

        </div>


        <div class="source-actions">

            <button
                class="watch-button"
            >
                Watch
            </button>


            <button
                class="download-button"
            >
                Download
            </button>

        </div>

    `;


    source
        .querySelector(
            ".watch-button"
        )
        .addEventListener(
            "click",
            function () {

                playMovie(
                    url,
                    state.currentMovie?.title ||
                    identifier
                );

            }
        );


    source
        .querySelector(
            ".download-button"
        )
        .addEventListener(
            "click",
            function () {

                downloadMovie(
                    url,
                    file.name
                );

            }
        );


    container.appendChild(
        source
    );

}


/*
========================================
DOWNLOAD
========================================

The browser-only download attempt is
not reliable for cross-origin media.

The backend will replace this function.
========================================
*/

function downloadMovie(
    url,
    filename
) {

    alert(
        "Download service is not connected yet.\n\n" +
        "The backend download system will be added next."
    );

}


/*
========================================
PLAYER
========================================
*/

function playMovie(
    url,
    title
) {

    state.previousScreen =
        "details";


    detailsSection.classList.add(
        "hidden"
    );


    librarySection.classList.add(
        "hidden"
    );


    playerSection.classList.remove(
        "hidden"
    );


    playerTitle.textContent =
        title;


    videoPlayer.src =
        url;


    videoPlayer.load();


    videoPlayer.play()
        .catch(
            function () {

                // Some browsers require
                // the user to press Play.

            }
        );


    rememberWatched(
        state.currentMovie
    );


    playerSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

}


/*
========================================
CLOSE PLAYER
========================================
*/

function closePlayer() {

    videoPlayer.pause();


    videoPlayer.removeAttribute(
        "src"
    );


    videoPlayer.load();


    if (
        state.currentMovie
    ) {

        openMovie(
            state.currentMovie
        );

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

    state.previousScreen =
        "library";


    hideSections();


    if (searchSection) {

        searchSection.classList.add(
            "hidden"
        );

    }


    if (resultsSection) {

        resultsSection.classList.add(
            "hidden"
        );

    }


    statusElement.classList.add(
        "hidden"
    );


    librarySection.classList.remove(
        "hidden"
    );


    renderLibrary();


    librarySection.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

}


/*
========================================
RENDER LIBRARY
========================================
*/

function renderLibrary() {

    libraryElement.innerHTML =
        "";


    if (
        !state.library ||
        state.library.length === 0
    ) {

        libraryElement.innerHTML =
            `
            <div class="empty">
                Your library is empty.
            </div>
            `;

        return;

    }


    state.library.forEach(
        function (movie) {

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "movie-card";


            const poster =
                getPoster(
                    movie.identifier
                );


            card.innerHTML = `

                ${
                    poster

                    ?

                    `<img
                        class="movie-poster"
                        src="${escapeAttribute(
                            poster
                        )}"
                        alt=""
                        loading="lazy"
                    >`

                    :

                    `<div class="no-poster">
                        No poster
                    </div>`
                }


                <div class="movie-info">

                    <h3 class="movie-title">
                        ${escapeHTML(
                            movie.title ||
                            movie.identifier
                        )}
                    </h3>


                    <div class="movie-meta">

                        ${escapeHTML(
                            movie.year ||
                            "Unknown year"
                        )}

                    </div>


                    <button
                        class="card-button"
                    >
                        Open
                    </button>

                </div>

            `;


            card
                .querySelector(
                    ".card-button"
                )
                .addEventListener(
                    "click",
                    function () {

                        openMovie(
                            movie
                        );

                    }
                );


            libraryElement.appendChild(
                card
            );

        }
    );

}


/*
========================================
RECENTLY WATCHED / LIBRARY
========================================
*/

function rememberWatched(movie) {

    if (!movie) {
        return;
    }


    const item = {

        identifier:
            movie.identifier,

        title:
            movie.title ||
            movie.identifier,

        year:
            movie.year ||
            extractYear(
                movie.date
            ),

        watchedAt:
            Date.now()

    };


    state.library =
        state.library.filter(
            function (existing) {

                return (
                    existing.identifier !==
                    item.identifier
                );

            }
        );


    state.library.unshift(
        item
    );


    state.library =
        state.library.slice(
            0,
            100
        );


    saveLibrary();

}


/*
========================================
LIBRARY STORAGE
========================================
*/

function loadLibrary() {

    try {

        const raw =
            localStorage.getItem(
                "movielite-library"
            );


        if (!raw) {
            return [];
        }


        const parsed =
            JSON.parse(raw);


        return Array.isArray(parsed)
            ? parsed
            : [];


    } catch (error) {

        console.error(
            "Could not load library:",
            error
        );

        return [];

    }

}


function saveLibrary() {

    try {

        localStorage.setItem(
            "movielite-library",
            JSON.stringify(
                state.library
            )
        );


    } catch (error) {

        console.error(
            "Could not save library:",
            error
        );

    }

}


/*
========================================
POSTERS
========================================
*/

function getPoster(
    identifier
) {

    if (!identifier) {
        return null;
    }


    return (
        `${API_BASE}/services/img/` +
        `${encodeURIComponent(identifier)}`
    );

}


/*
========================================
SOURCE URL
========================================
*/

function buildDownloadURL(
    identifier,
    filename
) {

    return (

        `${API_BASE}/download/` +

        `${encodeURIComponent(
            identifier
        )}/` +

        filename
            .split("/")
            .map(
                function (part) {

                    return encodeURIComponent(
                        part
                    );

                }
            )
            .join("/")

    );

}


/*
========================================
NAVIGATION
========================================
*/

function hideSections() {

    detailsSection.classList.add(
        "hidden"
    );


    playerSection.classList.add(
        "hidden"
    );


    librarySection.classList.add(
        "hidden"
    );

}


function showHome() {

    hideSections();


    if (searchSection) {

        searchSection.classList.remove(
            "hidden"
        );

    }


    if (resultsSection) {

        resultsSection.classList.remove(
            "hidden"
        );

    }


    statusElement.classList.remove(
        "hidden"
    );


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

}


/*
========================================
STATUS
========================================
*/

function setStatus(
    message
) {

    statusElement.textContent =
        message;

}


/*
========================================
UTILITIES
========================================
*/

function extractYear(
    date
) {

    if (!date) {
        return "";
    }


    const match =
        String(date)
            .match(
                /\b(19|20)\d{2}\b/
            );


    return match
        ? match[0]
        : "";

}


function cleanDescription(
    description
) {

    if (!description) {
        return "";
    }


    if (
        typeof description ===
        "string"
    ) {

        return description;

    }


    if (
        Array.isArray(
            description
        )
    ) {

        return description.join(
            " "
        );

    }


    return String(
        description
    );

}


function formatBytes(
    bytes
) {

    if (
        !bytes ||
        bytes <= 0
    ) {

        return "";

    }


    const units = [

        "B",
        "KB",
        "MB",
        "GB"

    ];


    let index = 0;

    let value = bytes;


    while (

        value >= 1024 &&

        index <
            units.length - 1

    ) {

        value /= 1024;

        index++;

    }


    return (

        value.toFixed(
            value >= 10
                ? 0
                : 1
        )

        +

        " " +

        units[index]

    );

}


function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );

}


function escapeAttribute(
    value
) {

    return escapeHTML(
        value
    );

}