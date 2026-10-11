
"use strict";

/* =========================================
   FLIGHTPRINT — AIRPORT DATA
   Loads airports from airports.json
   ========================================= */

const AIRPORTS_URL = "./airports.json";

const CAR_KG_PER_KM = 0.25;
const TREE_KG_PER_YEAR = 21;
const WORLD_KG_PER_YEAR = 4700;
const MAX_PASSENGERS = 20;

const $ = (id) => document.getElementById(id);

let airports = [];
let airportsByCode = new Map();

const CABINS = [
    ["economy", "Economy"],
    ["premium", "Premium economy"],
    ["business", "Business"],
    ["first", "First"]
];

/* =========================================
   NORMALIZE AIRPORT JSON
   Supports common airport JSON field names
   ========================================= */

function getField(airport, names) {
    for (const name of names) {
        if (
            airport[name] !== undefined &&
            airport[name] !== null &&
            String(airport[name]).trim() !== ""
        ) {
            return airport[name];
        }
    }

    return "";
}

function normalizeAirport(airport) {
    if (!airport || typeof airport !== "object") {
        return null;
    }

    const code = String(
        getField(airport, [
            "iata",
            "iata_code",
            "iataCode",
            "code",
            "airport_code",
            "airportCode"
        ])
    ).trim().toUpperCase();

    const name = String(
        getField(airport, [
            "name",
            "airport_name",
            "airportName",
            "airport",
            "ident"
        ])
    ).trim();

    const city = String(
        getField(airport, [
            "city",
            "municipality",
            "town",
            "locality"
        ]) || name
    ).trim();

    const country = String(
        getField(airport, [
            "country",
            "country_name",
            "countryName",
            "iso_country",
            "country_code"
        ])
    ).trim();

    const latitude = Number(
        getField(airport, [
            "lat",
            "latitude",
            "latitude_deg"
        ])
    );

    const longitude = Number(
        getField(airport, [
            "lon",
            "lng",
            "longitude",
            "longitude_deg"
        ])
    );

    // Only use valid three-letter IATA airport codes.
    if (!/^[A-Z]{3}$/.test(code)) return null;
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        return null;
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return null;
    }

    return {
        code,
        name: name || code,
        city: city || name || code,
        country,
        lat: latitude,
        lon: longitude
    };
}

function extractAirportArray(json) {
    // JSON may be a plain array or an object containing an array.
    if (Array.isArray(json)) return json;

    if (json && typeof json === "object") {
        for (const key of ["airports", "data", "results", "items"]) {
            if (Array.isArray(json[key])) return json[key];
        }

        // Also support JSON objects keyed by airport code.
        return Object.entries(json).map(([key, value]) => {
            if (!value || typeof value !== "object") return null;

            return {
                ...value,
                code: value.iata || value.iata_code ||
                    value.code || key
            };
        }).filter(Boolean);
    }

    return [];
}

/* =========================================
   LOAD AIRPORTS
   ========================================= */

async function loadAirports() {
    const list = $("airports");
    const from = $("from");
    const to = $("to");

    try {
        const response = await fetch(AIRPORTS_URL);

        if (!response.ok) {
            throw new Error(
                `Could not load ${AIRPORTS_URL} (${response.status}).`
            );
        }

        const json = await response.json();
        const rawAirports = extractAirportArray(json);

        airports = rawAirports
            .map(normalizeAirport)
            .filter(Boolean);

        // Remove duplicate airport codes.
        const uniqueAirports = new Map();

        for (const airport of airports) {
            if (!uniqueAirports.has(airport.code)) {
                uniqueAirports.set(airport.code, airport);
            }
        }

        airports = [...uniqueAirports.values()].sort((a, b) =>
            a.code.localeCompare(b.code)
        );

        airportsByCode = new Map(
            airports.map(airport => [airport.code, airport])
        );

        if (!airports.length) {
            throw new Error(
                "No usable airports were found. Check the fields in airports.json."
            );
        }

        // Populate the autocomplete suggestions.
        const fragment = document.createDocumentFragment();

        for (const airport of airports) {
            const option = document.createElement("option");

            option.value = formatAirport(airport);
            fragment.appendChild(option);
        }

        list.replaceChildren(fragment);

        // Use sensible defaults if those airports exist in the data.
        if (!findAirport(from.value)) {
            from.value = formatAirport(
                airportsByCode.get("JFK") || airports[0]
            );
        }

        if (!findAirport(to.value)) {
            const lax = airportsByCode.get("LAX");
            const alternative = airports.find(
                airport => airport.code !== fromAirportCode()
            );

            to.value = formatAirport(
                lax && lax.code !== fromAirportCode()
                    ? lax
                    : alternative || airports[0]
            );
        }

        setStatus("");
        update();

    } catch (error) {
        console.error("Flightprint airport loading error:", error);

        setStatus(
            "Airports could not be loaded. Check that airports.json exists " +
            "beside your HTML file and that you are running the site through a local server."
        );
    }
}

function setStatus(message) {
    const result = $("result");

    if (!result) return;

    if (!message) {
        result.textContent = "";
        return;
    }

    const notice = document.createElement("div");
    notice.className = "empty";
    notice.textContent = message;
    result.replaceChildren(notice);

    $("more").hidden = true;
}

/* =========================================
   AIRPORT SEARCH
   ========================================= */

function formatAirport(airport) {
    const location = [airport.city, airport.country]
        .filter(Boolean)
        .join(", ");

    return `${airport.code} (${airport.name}) - ${location}`;
}

function fromAirportCode() {
    return findAirport($("from").value)?.code || "";
}

function findAirport(value) {
    const query = String(value || "").trim();

    if (!query) return null;

    // Exact IATA code.
    const code = query.match(/^([A-Za-z]{3})(?:\s|$|\()/);

    if (code && airportsByCode.has(code[1].toUpperCase())) {
        return airportsByCode.get(code[1].toUpperCase());
    }

    const normalizedQuery = query.toLowerCase();

    // Match the full suggestion or a full airport name/city.
    return airports.find(airport => {
        const formatted = formatAirport(airport).toLowerCase();

        return (
            formatted === normalizedQuery ||
            airport.code.toLowerCase() === normalizedQuery ||
            airport.name.toLowerCase() === normalizedQuery ||
            airport.city.toLowerCase() === normalizedQuery
        );
    }) || null;
}

/* =========================================
   FLIGHT DISTANCE AND EMISSIONS
   ========================================= */

function haversine(a, b) {
    const R = 6371;
    const radians = Math.PI / 180;

    const dLat = (b.lat - a.lat) * radians;
    const dLon = (b.lon - a.lon) * radians;

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(a.lat * radians) *
        Math.cos(b.lat * radians) *
        Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}

function cabinMultiplier(cabin, longHaul) {
    if (cabin === "economy") return 1;
    if (cabin === "premium") return longHaul ? 1.6 : 1.3;
    if (cabin === "business") return longHaul ? 2.9 : 1.5;

    return longHaul ? 4.0 : 1.5;
}

function emissionsPerPerson(distanceKm, cabin, roundTrip) {
    // Add 8% to the great-circle distance for routing.
    const adjustedDistance = distanceKm * 1.08;

    // Approximate economy emissions in kg CO2.
    const baseEmissions = 15 + 0.065 * adjustedDistance;

    const multiplier = cabinMultiplier(
        cabin,
        adjustedDistance > 3700
    );

    return baseEmissions * multiplier * (roundTrip ? 2 : 1);
}

function formatKg(kg) {
    if (kg >= 1000) {
        return (kg / 1000).toFixed(2) + " t";
    }

    return Math.round(kg).toLocaleString() + " kg";
}

function formatNumber(number) {
    return Math.round(number).toLocaleString();
}

/* =========================================
   UPDATE RESULTS TICKET
   ========================================= */

function update() {
    if (!airports.length) return;

    const origin = findAirport($("from").value);
    const destination = findAirport($("to").value);

    const result = $("result");
    const more = $("more");

    if (!origin || !destination) {
        result.innerHTML =
            '<div class="empty">Choose two airports from the suggestions. ' +
            'You can search by airport code, city, or airport name.</div>';

        more.hidden = true;
        return;
    }

    if (origin.code === destination.code) {
        result.innerHTML =
            '<div class="empty">Your departure and destination airports are ' +
            'the same. Choose a different destination.</div>';

        more.hidden = true;
        return;
    }

    const selectedCabin = document.querySelector(
        'input[name="cabin"]:checked'
    );

    const cabin = selectedCabin ? selectedCabin.value : "economy";

    const passengersInput = $("passengers");
    const passengers = Math.max(
        1,
        Math.min(
            MAX_PASSENGERS,
            parseInt(passengersInput.value, 10) || 1
        )
    );

    passengersInput.value = passengers;

    const roundTrip = $("round").checked;
    const distance = haversine(origin, destination);

    const perPerson = emissionsPerPerson(
        distance,
        cabin,
        roundTrip
    );

    const total = perPerson * passengers;
    const cabinName = CABINS.find(item => item[0] === cabin)?.[1]
        || "Economy";

    const passengerDescription = passengers > 1
        ? `${formatKg(perPerson)} each for ${passengers} passengers`
        : "for one passenger";

    const totalParts = formatKg(total).split(" ");

    // Build the ticket. Airport data is inserted as text, not HTML.
    result.replaceChildren();

    const ticket = document.createElement("div");
    ticket.className = "pass";

    ticket.innerHTML = `
        <div class="pass-main">
            <div class="legs">
                <div>
                    <div class="code origin-code"></div>
                    <div class="where origin-where"></div>
                </div>

                <svg class="arc" viewBox="0 0 300 64"
                    preserveAspectRatio="none" aria-hidden="true">
                    <path d="M10 52 Q150 -22 290 52"></path>
                    <circle class="dot" cx="10" cy="52" r="5"></circle>
                    <circle class="dot" cx="290" cy="52" r="5"></circle>
                    <g transform="translate(150 15) rotate(90)">
                        <path class="plane"
                            d="M0 -9 L3 -2 L10 3 L10 5 L3 3 L2 8
                            L5 10 L5 11 L0 10 L-5 11 L-5 10
                            L-2 8 L-3 3 L-10 5 L-10 3 L-3 -2 Z">
                        </path>
                    </g>
                </svg>

                <div style="text-align:right">
                    <div class="code destination-code"></div>
                    <div class="where destination-where"></div>
                </div>
            </div>

            <div class="meta">
                <span class="distance"></span>
                <span class="cabin-name"></span>
                <span class="trip-type"></span>
                <span class="passenger-count"></span>
            </div>
        </div>

        <div class="pass-stub">
            <p class="stub-lbl">CO₂ for this trip</p>
            <div class="big">
                <span class="n"></span>
                <span class="u"></span>
            </div>
            <p class="stub-sub"></p>
        </div>
    `;

    // Safely insert airport names and other text.
    ticket.querySelector(".origin-code").textContent = origin.code;
    ticket.querySelector(".origin-where").textContent =
        `${origin.city}${origin.country ? "\n" + origin.country : ""}`;

    ticket.querySelector(".destination-code").textContent =
        destination.code;
    ticket.querySelector(".destination-where").textContent =
        `${destination.city}${destination.country
            ? "\n" + destination.country
            : ""}`;

    ticket.querySelector(".distance").innerHTML =
        `<b>${formatNumber(distance)} km</b> ` +
        `(${formatNumber(distance * 0.621371)} mi)`;

    ticket.querySelector(".cabin-name").innerHTML = `<b></b>`;
    ticket.querySelector(".cabin-name b").textContent = cabinName;

    ticket.querySelector(".trip-type").innerHTML = `<b></b>`;
    ticket.querySelector(".trip-type b").textContent =
        roundTrip ? "Round trip" : "One way";

    ticket.querySelector(".passenger-count").innerHTML = `<b></b>`;
    ticket.querySelector(".passenger-count b").textContent =
        `${passengers} passenger${passengers === 1 ? "" : "s"}`;

    ticket.querySelector(".big .n").textContent = totalParts[0];
    ticket.querySelector(".big .u").textContent = totalParts[1];
    ticket.querySelector(".stub-sub").textContent =
        passengerDescription;

    result.appendChild(ticket);

    // Set the divider-notch position for smaller screens.
    const stub = ticket.querySelector(".pass-stub");
    ticket.style.setProperty("--stub-h", `${stub.offsetHeight}px`);

    // Emissions comparisons use total trip emissions.
    const carKm = total / CAR_KG_PER_KM;
    const treeYears = total / TREE_KG_PER_YEAR;
    const worldShare = total / WORLD_KG_PER_YEAR * 100;

    const equals = $("equals");
    equals.replaceChildren();

    const comparisons = [
        {
            value: `${formatNumber(carKm)} km`,
            description:
                `of driving in an average U.S. passenger car ` +
                `(${formatNumber(carKm * 0.621371)} miles).`
        },
        {
            value: `${treeYears < 10
                ? treeYears.toFixed(1)
                : formatNumber(treeYears)} years`,
            description: "of CO₂ absorbed by one mature tree."
        },
        {
            value: `${worldShare < 10
                ? worldShare.toFixed(1)
                : formatNumber(worldShare)}%`,
            description:
                "of what the average person in the world emits in a year."
        }
    ];

    for (const comparison of comparisons) {
        const row = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");

        term.textContent = comparison.value;
        description.textContent = comparison.description;

        row.append(term, description);
        equals.appendChild(row);
    }

    more.hidden = false;
}

/* =========================================
   USER INTERACTIONS
   ========================================= */

// Swap departure and destination.
$("swap").addEventListener("click", () => {
    const from = $("from");
    const to = $("to");

    [from.value, to.value] = [to.value, from.value];

    update();
});

// Calculate when the Enter button is clicked.
$("enter").addEventListener("click", update);

// Recalculate when inputs change.
["from", "to", "passengers", "round"].forEach(id => {
    $(id).addEventListener("change", update);
});

document.querySelectorAll('input[name="cabin"]').forEach(input => {
    input.addEventListener("change", update);
});

// Reposition ticket notches after responsive layout changes.
window.addEventListener("resize", () => {
    const ticket = document.querySelector(".pass");
    const stub = document.querySelector(".pass-stub");

    if (ticket && stub) {
        ticket.style.setProperty("--stub-h", `${stub.offsetHeight}px`);
    }
});

// Load the airport database first.
loadAirports();
