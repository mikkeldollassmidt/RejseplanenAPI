const baseURL = 'http://xmlopen.rejseplanen.dk/bin/rest.exe/';

async function fetchLocation(query) {
    const response = await fetch(`${baseURL}location?input=${encodeURIComponent(query)}&format=json`);
    if (!response.ok) {
        throw new Error('Failed to fetch location data');
    }
    const data = await response.json();
    return data.LocationList;
}

async function fetchTrip(origin, destination) {
    const url = `${baseURL}trip?${origin}&${destination}&format=json`;
    console.log('Request URL:', url);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to fetch trip data');
    }
    const text = await response.text();
    if (!text) {
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

async function findTrip() {
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
        return;
    }

    const originType = originOption.dataset.type;
    const destinationType = destinationOption.dataset.type;

    let origin, destination;

    if (originType === 'stop') {
        origin = `originId=${originOption.dataset.id}`;
    } else {
        const [x, y] = originOption.dataset.id.split(',');
        origin = `originCoordX=${x}&originCoordY=${y}`;
    }

    if (destinationType === 'stop') {
        destination = `destId=${destinationOption.dataset.id}`;
    } else {
        const [x, y] = destinationOption.dataset.id.split(',');
        destination = `destCoordX=${x}&destCoordY=${y}`;
    }

    console.log('Formatted Origin:', origin);
    console.log('Formatted Destination:', destination);

    try {
        let tripData = await fetchTrip(origin, destination);
        if (!tripData || tripData.length === 0) {
            // Try a fallback approach if direct coordinate request fails
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
            return;
        }
        displayResults(tripData);
    } catch (error) {
        console.error('Error fetching trip data:', error);
        alert('An error occurred while fetching trip data. Please try again.');
    }
}

function displayResults(tripList) {
    const resultsContainer = document.getElementById('results');
    resultsContainer.innerHTML = '';

    if (!tripList || !tripList.Trip) {
        resultsContainer.innerHTML = '<p>No trips found.</p>';
        return;
    }

    tripList.Trip.forEach(trip => {
        const numberOfChanges = trip.Leg.length - 1;
        const tripElement = document.createElement('div');
        tripElement.className = 'trip';
        tripElement.innerHTML = `
            ${trip.Leg.map(leg => `
                <div class="trip-container">
                    <div class="trip-header">
                        <div class="trip-header-time">
                            <h1 class="trip-header-text">${leg.Origin.time} ${leg.Origin.name} <b>></b> ${leg.Destination.time} ${leg.Destination.name}</h1>
                        </div>
                    </div>
                </div>
            `).join('')}
            <div class="trip-header-change-outer-container">
                <hr class="trip-header-hr">
                <div class="trip-header-change">
                    <h1 class="trip-header-change-count">${numberOfChanges}</h1>
                    <h1 class="trip-header-change-title">Skift</h1>
                </div>
            </div>
        `;
        resultsContainer.appendChild(tripElement);
    });
}

function handleAutoComplete(inputType) {
    document.getElementById(inputType).addEventListener('input', () => updateSuggestions(inputType));
}

function initialize() {
    handleAutoComplete('origin');
    handleAutoComplete('destination');

    document.querySelector('button').addEventListener('click', findTrip);
}

window.onload = initialize;
