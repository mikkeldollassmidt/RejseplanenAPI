const baseURL = 'http://xmlopen.rejseplanen.dk/bin/rest.exe/';

async function fetchLocation(query) {
    const response = await fetch(`${baseURL}location?input=${encodeURIComponent(query)}&format=json`);
    if (!response.ok) {
        throw new Error('Failed to fetch location data');
    }
    const data = await response.json();
    return data.LocationList;
}

async function fetchStopsNearby(x, y, radius = 1000, maxResults = 1) {
    const response = await fetch(`${baseURL}stopsNearby?coordX=${x}&coordY=${y}&maxRadius=${radius}&maxNumber=${maxResults}&format=json`);
    if (!response.ok) {
        throw new Error('Failed to fetch nearby stops');
    }
    const data = await response.json();
    return data.LocationList.StopLocation;
}

async function fetchTrip(origin, destination) {
    const url = `${baseURL}trip?${origin}&${destination}&format=json`;
    console.log('Request URL:', url);
    const response = await fetch(url);
    if (!response.ok) {
        console.error('Fetch failed:', response.status, response.statusText);
        throw new Error('Failed to fetch trip data');
    }
    const text = await response.text();
    console.log('Response text:', text); // Added for debugging
    if (!text) {
        console.error('Empty response from API');
        throw new Error('Empty response from API');
    }
    try {
        const data = JSON.parse(text);
        return data.TripList;
    } catch (jsonError) {
        console.error('JSON parsing error:', jsonError);
        console.error('Response text:', text);
        throw new Error('Invalid JSON response');
    }
}

function getSuggestionsHTML(locations) {
    return locations.map(location => {
        const id = location.id ? location.id : `${location.x},${location.y}`;
        const type = location.id ? 'stop' : 'coord';
        return `<option value="${location.name}" data-id="${id}" data-type="${type}"></option>`;
    }).join('');
}

async function updateSuggestions(inputType) {
    const input = document.getElementById(inputType).value;
    const suggestionsList = document.getElementById(`${inputType}-suggestions`);

    if (input.length < 3) {
        suggestionsList.innerHTML = '';
        return;
    }

    try {
        const locationData = await fetchLocation(input);
        suggestionsList.innerHTML = '';

        const locations = [];
        if (locationData.StopLocation) {
            locations.push(...(Array.isArray(locationData.StopLocation) ? locationData.StopLocation : [locationData.StopLocation]));
        }
        if (locationData.CoordLocation) {
            locations.push(...(Array.isArray(locationData.CoordLocation) ? locationData.CoordLocation : [locationData.CoordLocation]));
        }

        suggestionsList.innerHTML = getSuggestionsHTML(locations);
    } catch (error) {
        console.error('Error fetching location data:', error);
        alert('Failed to update suggestions.');
    }
}

async function findNearestStop(coordX, coordY) {
    try {
        const stops = await fetchStopsNearby(coordX, coordY);
        if (stops.length > 0) {
            const stop = stops[0];
            return { id: stop.id, name: stop.name, x: stop.x, y: stop.y };
        }
    } catch (error) {
        console.error('Error fetching nearby stops:', error);
    }
    return null;
}

async function findTrip() {
    const loadingElement = document.getElementById('loading');
    loadingElement.style.display = 'block'; // Show the loading circle

    const originInput = document.getElementById('origin').value.trim();
    const destinationInput = document.getElementById('destination').value.trim();
    const originOption = Array.from(document.querySelectorAll('#origin-suggestions option')).find(option => option.value.trim().toLowerCase() === originInput.toLowerCase());
    const destinationOption = Array.from(document.querySelectorAll('#destination-suggestions option')).find(option => option.value.trim().toLowerCase() === destinationInput.toLowerCase());

    console.log('originInput:', originInput);
    console.log('destinationInput:', destinationInput);
    console.log('originOption:', originOption);
    console.log('destinationOption:', destinationOption);

    if (!originOption || !destinationOption) {
        alert('Please select valid suggestions for both origin and destination.');
        loadingElement.style.display = 'none'; // Hide the loading circle
        return;
    }

    const originType = originOption.dataset.type;
    const destinationType = destinationOption.dataset.type;

    let origin, destination;

    if (originType === 'stop') {
        origin = `originId=${originOption.dataset.id}`;
    } else {
        const [x, y] = originOption.dataset.id.split(',');
        const nearestStop = await findNearestStop(x, y);
        if (nearestStop) {
            origin = `originId=${nearestStop.id}`;
        } else {
            origin = `originCoordX=${x}&originCoordY=${y}`;
        }
    }

    if (destinationType === 'stop') {
        destination = `destId=${destinationOption.dataset.id}`;
    } else {
        const [x, y] = destinationOption.dataset.id.split(',');
        const nearestStop = await findNearestStop(x, y);
        if (nearestStop) {
            destination = `destId=${nearestStop.id}`;
        } else {
            destination = `destCoordX=${x}&destCoordY=${y}`;
        }
    }

    console.log('Formatted Origin:', origin);
    console.log('Formatted Destination:', destination);

    try {
        let tripData = await fetchTrip(origin, destination);
        if (!tripData || tripData.length === 0) {
            if (originType === 'coord') {
                origin = `originCoordX=${originOption.dataset.id.split(',')[0]}&originCoordY=${originOption.dataset.id.split(',')[1]}&useProximity=1`;
            }
            if (destinationType === 'coord') {
                destination = `destCoordX=${destinationOption.dataset.id.split(',')[0]}&destCoordY=${destinationOption.dataset.id.split(',')[1]}&useProximity=1`;
            }
            tripData = await fetchTrip(origin, destination);
        }
        if (!tripData || tripData.length === 0) {
            alert('No trips found. Please try different locations.');
            loadingElement.style.display = 'none'; // Hide the loading circle
            return;
        }
        displayResults(tripData);
    } catch (error) {
        console.error('Error fetching trip data:', error);
        alert('An error occurred while fetching trip data. Please try again.');
    } finally {
        loadingElement.style.display = 'none'; // Hide the loading circle after fetching data
    }
}

function formatNotes(notes) {
    const parts = notes.split(';');
    if (parts.length === 0) return '';
    const firstSentence = parts[0].startsWith("Retning") ? parts[0] : '';
    const remainingSentences = parts.slice(1).join(', ');
    return { firstSentence, remainingSentences };
}

function displayResults(tripList) {
    const resultsContainer = document.getElementById('results');
    resultsContainer.innerHTML = '';

    if (!tripList || !tripList.Trip) {
        resultsContainer.innerHTML = '<p>No trips found.</p>';
        return;
    }

    tripList.Trip.forEach(trip => {
        const legs = Array.isArray(trip.Leg) ? trip.Leg : [trip.Leg]; 
        const numberOfChanges = legs.length - 1;

        const departureTime = new Date(`1970-01-01T${legs[0].Origin.time}:00`);
        const arrivalTime = new Date(`1970-01-01T${legs[legs.length - 1].Destination.time}:00`);
        let totalDuration = (arrivalTime - departureTime) / (1000 * 60);

        if (totalDuration < 0) {
            totalDuration += 24 * 60;
        }

        const totalHours = Math.floor(totalDuration / 60);
        const totalMinutes = totalDuration % 60;

        const tripElement = document.createElement('div');
        tripElement.className = 'trip-summary';
        tripElement.innerHTML = `
            <div class="trip-container">
                <div class="trip-header" onclick="toggleDetails(this)">
                    <div class="trip-header-time">
                        <h1 class="trip-header-text">${legs[0].Origin.time} ${legs[0].Origin.name} <b>></b> ${legs[legs.length - 1].Destination.time} ${legs[legs.length - 1].Destination.name}</h1>
                        <h2 class="trip-header-duration">${totalHours > 0 ? `${totalHours} t ` : ''}${totalMinutes} min</h2>
                    </div>
                    <div class="trip-header-change-outer-container">
                        <hr class="trip-header-hr">
                        <div class="trip-header-change">
                            <h1 class="trip-header-change-count">${numberOfChanges}</h1>
                            <h1 class="trip-header-change-title">Skift</h1>
                        </div>
                    </div>
                </div>
                <div class="trip-details" style="display: none;">
                    ${legs.map((leg, index) => {
                        const legDepartureTime = new Date(`1970-01-01T${leg.Origin.time}:00`);
                        const legArrivalTime = new Date(`1970-01-01T${leg.Destination.time}:00`);
                        let legDuration = (legArrivalTime - legDepartureTime) / (1000 * 60);

                        if (legDuration < 0) {
                            legDuration += 24 * 60;
                        }

                        const legHours = Math.floor(legDuration / 60);
                        const legMinutes = legDuration % 60;

                        const formattedNotes = leg.Notes ? formatNotes(leg.Notes.text) : { firstSentence: '', remainingSentences: '' };

                        return `
                            ${index > 0 ? '<hr class="trips-hr">' : ''}
                            <div class="trip-container2">
                                <div class="trip-header2">
                                    <div class="trip-header-time">
                                        <div class="trip-header-mini">
                                            <h1 class="trip-header-text2">${leg.Origin.time} ${leg.Origin.name}</h1>
                                            <div class="trip-header-mini-mini"><h2 class="trip-header-duration2">${legHours > 0 ? `${legHours} t ` : ''}${legMinutes} min</h2>${leg.Origin.track ? `<h1 class="trip-header-text3">Sp. ${leg.Origin.track}</h1>` : ''}</div>
                                        </div>
                                        <div class="trip-header-mode-con"><h2 class="trip-header-mode">${leg.name}</h2>${formattedNotes.firstSentence ? `<h1 class="trip-header-notes">${formattedNotes.firstSentence}</h1>` : ''}</div>
                                        <h1 class="trip-header-text2">${leg.Destination.time} ${leg.Destination.name}</h1>
                                        ${formattedNotes.remainingSentences ? `<h1 class="trip-header-notes-caution">${formattedNotes.remainingSentences}</h1>` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        resultsContainer.appendChild(tripElement);
    });
}

function toggleDetails(headerElement) {
    const detailsElement = headerElement.nextElementSibling;
    if (detailsElement.style.display === 'none') {
        detailsElement.style.display = 'block';
    } else {
        detailsElement.style.display = 'none';
    }
}

function handleAutoComplete(inputType) {
    document.getElementById(inputType).addEventListener('input', () => updateSuggestions(inputType));
}

function initialize() {
    handleAutoComplete('origin');
    handleAutoComplete('destination');

    document.querySelector('button').addEventListener('click', findTrip);
}

document.addEventListener('DOMContentLoaded', function() {
    const originInput = document.getElementById('origin');
    const destinationInput = document.getElementById('destination');
    const aElement = document.querySelector('.a-b-a');
    const bElement = document.querySelector('.a-b-b');

    originInput.addEventListener('focus', function() {
        aElement.classList.add('active');
        bElement.classList.remove('active'); // Deactivate B
    });

    originInput.addEventListener('blur', function() {
        if (!originInput.value) {
            aElement.classList.remove('active');
        }
    });

    originInput.addEventListener('input', function() {
        aElement.classList.add('active');
        bElement.classList.remove('active'); // Deactivate B
    });

    destinationInput.addEventListener('focus', function() {
        bElement.classList.add('active');
        aElement.classList.remove('active'); // Deactivate A
    });

    destinationInput.addEventListener('blur', function() {
        if (!destinationInput.value) {
            bElement.classList.remove('active');
        }
    });

    destinationInput.addEventListener('input', function() {
        bElement.classList.add('active');
        aElement.classList.remove('active'); // Deactivate A
    });
});


window.onload = initialize;

