// Establish a connection to the server
const socket = io();

// DOM Element References
const nameModalOverlay = document.getElementById('name-modal-overlay');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const userList = document.getElementById('user-list');

let userName = "";
let myCoords = null; // To store the user's current coordinates
let map; // To hold the map instance
const markers = {}; // To store map markers for each user
let routeControl = null; // To hold the routing control instance
let initialZoomDone = false;

// --- Mobile UI Toggling Logic ---
const userPanel = document.getElementById('user-panel');
const showUsersBtn = document.getElementById('show-users-btn');
const closePanelBtn = document.getElementById('close-panel-btn');

// Show the user panel when the floating button is clicked
showUsersBtn.addEventListener('click', () => {
    userPanel.classList.remove('translate-y-full');
});

// Hide the user panel when the close button is clicked
closePanelBtn.addEventListener('click', () => {
    userPanel.classList.add('translate-y-full');
});

// --- User Name Handling ---
nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (name) {
        userName = name;
        nameModalOverlay.style.display = 'none'; // Hide the modal
        initializeMapAndLocation(); // Start the main application logic
    }
});

// --- Map Initialization and Geolocation ---
function initializeMapAndLocation() {
    // Initialize Leaflet map, centered at a default location
    map = L.map("map").setView([0, 0], 2);

    // Add a tile layer from OpenStreetMap
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "OpenStreetMap",
    }).addTo(map);

    // Use the browser's Geolocation API to watch the user's position
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                myCoords = { latitude, longitude };
                
                // Send location data to the server
                socket.emit("send-location", { latitude, longitude, name: userName });
            },
            (error) => {
                console.error("Geolocation error:", error);
                // Optionally, provide feedback to the user that location is unavailable
                alert("Could not get your location. Please enable location services.");
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0,
            }
        );
    } else {
        alert("Geolocation is not supported by this browser.");
    }
}

// --- Socket.IO Event Handlers ---

// Handle receiving location data from the server
socket.on("receive-location", (data) => {
    const { id, latitude, longitude, name } = data;

    // --- UPDATED LOGIC ---
    // Center the map on the user's location the first time it's received.
    if (id === socket.id && !initialZoomDone) {
        map.setView([latitude, longitude], 16); // 16 is a nice close-up zoom level
        initialZoomDone = true;
    }

    // Update or create a marker for the user
    if (markers[id]) {
        markers[id].setLatLng([latitude, longitude]);
    } else {
        markers[id] = L.marker([latitude, longitude])
            .addTo(map)
            .bindPopup(`<b>${name}</b>`);
    }

    // Update the user list in the sidebar
    updateUserList();
});

// Handle user disconnection
socket.on("user-disconnected", (id) => {
    // Remove the user's marker from the map
    if (markers[id]) {
        map.removeLayer(markers[id]);
        delete markers[id];
    }
    
    // Remove the routing line if it was connected to the disconnected user
    if (routeControl && routeControl.getWaypoints().some(wp => wp.latLng && markers[id] && wp.latLng.equals(markers[id].getLatLng()))) {
        map.removeControl(routeControl);
        routeControl = null;
    }
    
    // Update the user list
    updateUserList();
});


// public/js/script.js

function updateUserList() {
    userList.innerHTML = ''; // Clear the current list

    // Add the current user to the top of the list with special styling
    if (markers[socket.id]) {
        const currentUserMarker = markers[socket.id];
        const currentUserName = currentUserMarker.getPopup().getContent().replace(/<b>|<\/b>/g, '');
        
        const li = document.createElement('li');
        li.textContent = `${currentUserName} (You)`;
        li.dataset.socketId = socket.id;
        
        // Special styling for the current user (not clickable for routing)
        li.classList.add(
            'px-2', 'py-3', 'rounded', 'font-semibold', 'bg-blue-100', 'text-blue-800'
        );
        userList.appendChild(li);
    }

    // Add other active users
    Object.keys(markers).forEach(id => {
        // Skip the current user since we already added them
        if (id === socket.id) return; 
        
        const marker = markers[id];
        const name = marker.getPopup().getContent().replace(/<b>|<\/b>/g, '');
        
        const li = document.createElement('li');
        li.textContent = name;
        li.dataset.socketId = id;
        
        // Standard styling for other users (clickable for routing)
        li.classList.add(
            'px-2', 'py-3', 'rounded', 'font-medium', 
            'cursor-pointer', 'transition-colors', 'hover:bg-gray-200'
        );
        
        li.addEventListener('click', () => handleUserClick(id));
        userList.appendChild(li);
    });
}

function handleUserClick(targetId) {
    if (!myCoords) {
        alert("Your location is not available yet.");
        return;
    }

    const targetMarker = markers[targetId];
    if (!targetMarker) return;

    // Remove active state from other users, preserving the current user's style
    document.querySelectorAll('#user-list li').forEach(li => {
        if (li.dataset.socketId !== socket.id) { // Don't change the "(You)" li
            li.classList.remove('bg-blue-600', 'text-white');
            li.classList.add('hover:bg-gray-200');
        }
    });
    
    // Add active state to the clicked user
    const activeLi = document.querySelector(`#user-list li[data-socket-id='${targetId}']`);
    activeLi.classList.add('bg-blue-600', 'text-white');
    activeLi.classList.remove('hover:bg-gray-200');

    const targetLatLng = targetMarker.getLatLng();

    if (routeControl) {
        map.removeControl(routeControl);
    }

    routeControl = L.Routing.control({
        waypoints: [
            L.latLng(myCoords.latitude, myCoords.longitude),
            targetLatLng,
        ],
        routeWhileDragging: false,
        addWaypoints: false,
        draggableWaypoints: false,
        show: false,
        createMarker: () => null,
    }).addTo(map);

    // On mobile, hide the panel after selecting a user
    if (window.innerWidth < 768) {
        userPanel.classList.add('translate-y-full');
    }
}