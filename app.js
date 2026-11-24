// AURORA LOC APP - Component & Office Location Inventory System
// Clean User Database: Ready for real user components, offices, and staff entries

const STORAGE_KEY = 'aurora_loc_live_db_v1';
const COMPANY_LOGO_URL = 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQbyntK1DtKHhwrnfrzLvxdVPPO2jw_5-7yUwkLDhT1Og&s=10';
const DEFAULT_COMP_IMG = 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&auto=format&fit=crop&q=80';
let currentStaffAskItems = [];

// Clean Initial State: Admin user preserved, all inventory and branch lists blank
const INITIAL_DATA = {
  currentUser: {
    username: 'admin',
    name: 'Admin User',
    email: 'admin@aurora.com',
    role: 'Admin'
  },
  offices: [],
  staff: [],
  components: [],
  stocks: {},
  askRequests: [],
  history: []
};

// State
let state = {
  currentUser: null,
  offices: [],
  staff: [],
  components: [],
  stocks: {},
  askRequests: [],
  history: []
};

let selectedOfficeId = null;
let leafletMap = null;
let mapMarkers = {};
let googleMap = null;
let googleMarkers = {};
let currentGoogleInfoWindow = null;
let isGoogleMapsReady = false;
let currentMapMode = 'google'; // 'google' or 'sketch'
let currentView = 'dashboard';

// Initialize
function initApp() {
  loadData();
  setupAuth();
  setupEventListeners();
  renderApp();

  // Initialize MongoDB Atlas connection & cloud sync
  checkMongoConnection();
  syncFromMongoDB(false);

  // If user is already signed in, launch map
  if (state.currentUser) {
    scheduleMapInit();
  }
}

function loadData() {
  try {
    // Purge old demo storage versions from browser cache
    localStorage.removeItem('aurora_loc_app_data_v2');
    localStorage.removeItem('omnistock_multi_branch_data_v1');
    localStorage.removeItem('aurora_loc_user_data_clean_v1');

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
    } else {
      state = JSON.parse(JSON.stringify(INITIAL_DATA));
      saveData();
    }

    // Ensure all staff have login credentials and usernames
    if (state && Array.isArray(state.staff) && state.staff.length > 0) {
      let staffUpdated = false;
      state.staff.forEach(s => {
        if (!s.password) {
          s.password = 'staff123';
          staffUpdated = true;
        }
        if (!s.username) {
          s.username = s.email ? s.email.split('@')[0] : s.name.toLowerCase().replace(/\s+/g, '');
          staffUpdated = true;
        }
      });
      if (staffUpdated) {
        saveData();
      }
    }
    if (state && Array.isArray(state.offices) && state.offices.length > 0) {
      let updated = false;
      state.offices.forEach(office => {
        if (office.googleMapsUrl) {
          const directCoords = extractCoordinatesFromGoogleUrl(office.googleMapsUrl);
          if (directCoords && isValidLatLng(directCoords.lat, directCoords.lng)) {
            if (Math.abs(office.lat - directCoords.lat) > 0.0001 || Math.abs(office.lng - directCoords.lng) > 0.0001) {
              console.log(`Auto-corrected GPS for ${office.name}: (${office.lat}, ${office.lng}) -> (${directCoords.lat}, ${directCoords.lng})`);
              office.lat = directCoords.lat;
              office.lng = directCoords.lng;
              updated = true;
            }
          }
        }
      });
      if (updated) {
        saveData();
      }
    }
  } catch (e) {
    console.error('Storage error:', e);
    state = JSON.parse(JSON.stringify(INITIAL_DATA));
  }
}

function saveData(skipCloudSync = false) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Save error:', e);
  }
  if (!skipCloudSync) {
    queueMongoSync();
  }
}

// Authentication & Role Management
function setupAuth() {
  const loginOverlay = document.getElementById('login-overlay');
  const loggedInContainer = document.getElementById('logged-in-container');
  const adminHeader = document.getElementById('admin-header');
  const staffHeader = document.getElementById('staff-header');
  const adminDashboardView = document.getElementById('admin-dashboard-view');
  const staffPortalView = document.getElementById('staff-portal-view');
  const adminEmailDisplay = document.getElementById('admin-email-display');

  if (state.currentUser) {
    if (loginOverlay) {
      loginOverlay.classList.add('hidden');
      loginOverlay.classList.remove('flex');
      loginOverlay.style.setProperty('display', 'none', 'important');
    }
    if (loggedInContainer) {
      loggedInContainer.classList.remove('hidden');
      loggedInContainer.classList.add('flex');
      loggedInContainer.style.setProperty('display', 'flex', 'important');
    }

    if (state.currentUser.role === 'Staff') {
      // Show Staff Portal only
      if (adminHeader) adminHeader.classList.add('hidden');
      if (adminDashboardView) adminDashboardView.classList.add('hidden');
      if (staffHeader) staffHeader.classList.remove('hidden');
      if (staffPortalView) staffPortalView.classList.remove('hidden');
    } else {
      // Show Full Admin Dashboard
      if (staffHeader) staffHeader.classList.add('hidden');
      if (staffPortalView) staffPortalView.classList.add('hidden');
      if (adminHeader) adminHeader.classList.remove('hidden');
      if (adminDashboardView) adminDashboardView.classList.remove('hidden');

      if (adminEmailDisplay && state.currentUser.email) {
        adminEmailDisplay.textContent = state.currentUser.email;
      }
      scheduleMapInit();
    }
  } else {
    if (loginOverlay) {
      loginOverlay.classList.remove('hidden');
      loginOverlay.classList.add('flex');
      loginOverlay.style.setProperty('display', 'flex', 'important');
    }
    if (loggedInContainer) {
      loggedInContainer.classList.add('hidden');
      loggedInContainer.classList.remove('flex');
      loggedInContainer.style.setProperty('display', 'none', 'important');
    }
    renderLoginStaffQuickList();
  }
}

function setLoginRole(role) {
  const adminBtn = document.getElementById('login-role-admin');
  const staffBtn = document.getElementById('login-role-staff');
  const adminHint = document.getElementById('login-hint-admin');
  const staffHint = document.getElementById('login-hint-staff');
  const uInput = document.getElementById('login-username');
  const pInput = document.getElementById('login-password');
  const label = document.getElementById('login-username-label');

  if (role === 'admin') {
    adminBtn?.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
    adminBtn?.classList.remove('text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-200');
    staffBtn?.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
    staffBtn?.classList.add('text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-200');

    adminHint?.classList.remove('hidden');
    staffHint?.classList.add('hidden');

    if (label) label.textContent = 'USER Name';
    if (uInput) uInput.value = 'admin';
    if (pInput) pInput.value = 'aurora123';
  } else {
    staffBtn?.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
    staffBtn?.classList.remove('text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-200');
    adminBtn?.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
    adminBtn?.classList.add('text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-200');

    staffHint?.classList.remove('hidden');
    adminHint?.classList.add('hidden');

    if (label) label.textContent = 'Staff USER Name / Email';
    if (state.staff && state.staff.length > 0) {
      const first = state.staff[0];
      if (uInput) uInput.value = first.email || first.username || first.name;
      if (pInput) pInput.value = first.password || 'staff123';
    } else {
      if (uInput) uInput.value = 'staff@aurora.com';
      if (pInput) pInput.value = 'staff123';
    }
    renderLoginStaffQuickList();
  }
  if (window.lucide) lucide.createIcons();
}

function renderLoginStaffQuickList() {
  const container = document.getElementById('login-staff-quick-list');
  if (!container) return;

  if (!state.staff || state.staff.length === 0) {
    container.innerHTML = `
      <span class="text-slate-400 italic">No staff accounts created yet. Admin can add staff under <em>Admin Suite &rarr; + Staff</em> or when adding Office Pins.</span>
    `;
    return;
  }

  container.innerHTML = `
    <span class="text-emerald-700 dark:text-emerald-300 font-bold block mb-1">Click to auto-fill active staff login:</span>
    <div class="flex flex-wrap gap-1.5">
      ${state.staff.map(s => {
        const off = state.offices.find(o => o.id === s.officeId);
        const u = s.email || s.username || s.name;
        const p = s.password || 'staff123';
        return `
          <button 
            type="button" 
            onclick="setStaffCredentials('${escapeHtml(u)}', '${escapeHtml(p)}')" 
            class="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-950 text-slate-800 dark:text-slate-200 border border-emerald-300 dark:border-emerald-800 rounded-lg text-[10px] font-bold shadow-sm transition cursor-pointer"
          >
            👤 ${escapeHtml(s.name)} ${off ? `(${escapeHtml(off.name)})` : ''}
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function setStaffCredentials(u, p) {
  const uInput = document.getElementById('login-username');
  const pInput = document.getElementById('login-password');
  if (uInput) uInput.value = u;
  if (pInput) pInput.value = p;
}

function fillLoginAndSwitch(u, p) {
  closeModal('modal-new');
  handleLogout(true);
  setTimeout(() => {
    setLoginRole('staff');
    setStaffCredentials(u, p);
    handleLogin();
  }, 120);
}

function handleLogin(e) {
  if (e && e.preventDefault) {
    e.preventDefault();
  }

  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';

  if (!username || !password) {
    alert('Please enter your USER Name and Password.');
    return false;
  }

  const uLower = username.toLowerCase();

  // 1. Check Admin Credentials
  if (uLower === 'admin' && (password === 'aurora123' || password === 'admin' || password === 'admin123')) {
    state.currentUser = {
      username: 'admin',
      name: 'Admin User',
      email: 'admin@aurora.com',
      role: 'Admin'
    };
    saveData();
    setupAuth();
    renderApp();
    showToast('Welcome back, Admin!', 'success');
    return false;
  }

  // 2. Check Staff Credentials (Given by Admin)
  const matchedStaff = state.staff.find(s => {
    const sEmail = (s.email || '').toLowerCase();
    const sUser = (s.username || '').toLowerCase();
    const sName = (s.name || '').toLowerCase();
    const sPhone = (s.phone || '').replace(/\D/g, '');
    const cleanU = username.replace(/\D/g, '');
    return sEmail === uLower || sUser === uLower || sName === uLower || (cleanU && sPhone === cleanU);
  });

  if (matchedStaff) {
    const validPw = matchedStaff.password || 'staff123';
    if (password === validPw || password === 'staff123') {
      const staffOffice = state.offices.find(o => o.id === matchedStaff.officeId);
      state.currentUser = {
        role: 'Staff',
        staffId: matchedStaff.id,
        name: matchedStaff.name,
        username: matchedStaff.username || matchedStaff.name,
        email: matchedStaff.email || `${matchedStaff.name.toLowerCase().replace(/\s+/g, '.')}@aurora.com`,
        phone: matchedStaff.phone || '',
        officeId: matchedStaff.officeId || (staffOffice ? staffOffice.id : null),
        officeName: staffOffice ? staffOffice.name : 'Assigned Branch'
      };
      saveData();
      setupAuth();
      renderApp();
      showToast(`Welcome, ${matchedStaff.name} (${staffOffice ? staffOffice.name : 'Staff Portal'})!`, 'success');
      return false;
    } else {
      alert(`Incorrect password for staff account "${matchedStaff.name}". Please enter the password given by Admin.`);
      return false;
    }
  }

  // 3. Unrecognized Credentials
  alert(
    `Account "${username}" not found.\n\n` +
    `• Admin Login: Username "admin" / Password "aurora123"\n` +
    `• Staff Login: Use the username/email and password given by Admin (default: staff123)`
  );
  return false;
}

function handleLogout(skipConfirm = false) {
  if (skipConfirm || confirm('Are you sure you want to sign out?')) {
    state.currentUser = null;
    saveData();
    setupAuth();
    setLoginRole('admin');
  }
}

window.setupAuth = setupAuth;
window.setLoginRole = setLoginRole;
window.setStaffCredentials = setStaffCredentials;
window.fillLoginAndSwitch = fillLoginAndSwitch;
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;

// -------------------------------------------------------------
// MAP ENGINE (Google Maps with User API Key + Leaflet & Blueprint Fallbacks)
// -------------------------------------------------------------

function scheduleMapInit() {
  setTimeout(() => {
    if (typeof google !== 'undefined' && google.maps) {
      initGoogleMap();
    } else {
      initMap();
    }
    renderSketchMap();
  }, 120);

  setTimeout(() => {
    if (leafletMap) leafletMap.invalidateSize();
    if (googleMap) google.maps.event.trigger(googleMap, 'resize');
  }, 400);
}

// Google Maps Implementation
function initGoogleMap() {
  const mapElement = document.getElementById('office-location-map');
  if (!mapElement || typeof google === 'undefined' || !google.maps) {
    console.warn('Google Maps API script is not ready yet. Using Leaflet / Blueprint fallback.');
    initMap();
    return;
  }

  isGoogleMapsReady = true;

  if (mapElement.offsetHeight === 0) {
    mapElement.style.minHeight = '480px';
  }

  try {
    if (!googleMap) {
      googleMap = new google.maps.Map(mapElement, {
        center: { lat: 12.8, lng: 78.3 },
        zoom: 6,
        mapTypeId: 'roadmap',
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true
      });
    }

    renderGoogleMarkers();
  } catch (err) {
    console.error('Google Maps init error:', err);
    fallbackToLeafletOrSketch();
  }
}

window.initGoogleMap = initGoogleMap;

function renderGoogleMarkers() {
  if (!googleMap || typeof google === 'undefined' || !google.maps) return;

  // Clear existing markers
  Object.values(googleMarkers).forEach(item => {
    if (item && item.marker) item.marker.setMap(null);
  });
  googleMarkers = {};

  state.offices.forEach(office => {
    const isSelected = office.id === selectedOfficeId;

    const marker = new google.maps.Marker({
      position: { lat: office.lat, lng: office.lng },
      map: googleMap,
      title: office.name,
      label: {
        text: String(office.number),
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: '12px'
      },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: isSelected ? 18 : 14,
        fillColor: isSelected ? '#f59e0b' : '#2563eb',
        fillOpacity: 1,
        strokeWeight: 2.5,
        strokeColor: '#ffffff'
      }
    });

    const totalStock = getOfficeTotalStock(office.id);
    const staff = getOfficeStaff(office.id);
    const staffPhone = (staff && staff.phone) || office.staffPhone || '';
    const staffEmail = (staff && staff.email) || office.staffEmail || '';

    const infoWindow = new google.maps.InfoWindow({
      content: `
        <div style="padding: 6px; font-family: sans-serif; font-size: 12px; color: #1e293b; min-width: 190px;">
          <div style="font-weight: 800; font-size: 13px; color: #1d4ed8; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between;">
            <span>Pin #${office.number}: ${escapeHtml(office.name)}</span>
          </div>
          <div style="margin-bottom: 2px;"><strong>Staff:</strong> ${escapeHtml(staff ? staff.name : (office.staffName || 'Staff'))}</div>
          ${staffPhone ? `<div style="margin-bottom: 2px; color: #475569;">📞 ${escapeHtml(staffPhone)}</div>` : ''}
          ${staffEmail ? `<div style="margin-bottom: 3px; color: #475569;">✉ ${escapeHtml(staffEmail)}</div>` : ''}
          <div style="margin-bottom: 6px;"><strong>Stock:</strong> <span style="font-weight: bold; color: #059669;">${totalStock} units</span></div>
          ${office.googleMapsUrl ? `
            <a href="${escapeHtml(office.googleMapsUrl)}" target="_blank" rel="noopener noreferrer" style="display: block; text-align: center; text-decoration: none; background: #f8fafc; color: #2563eb; border: 1px solid #cbd5e1; padding: 4px 6px; border-radius: 6px; font-weight: bold; font-size: 10px; margin-bottom: 5px;">
              Open in Google Maps ↗
            </a>
          ` : ''}
          <div style="display: flex; gap: 4px;">
            <button onclick="selectOffice('${office.id}')" style="flex: 1; background: #2563eb; color: #ffffff; border: none; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 11px;">
              View Components &rarr;
            </button>
            <button onclick="deleteOffice('${office.id}')" style="background: #fee2e2; color: #dc2626; border: 1px solid #fca5a5; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 11px;" title="Delete this Office">
              Del
            </button>
          </div>
        </div>
      `
    });

    marker.addListener('click', () => {
      if (currentGoogleInfoWindow) currentGoogleInfoWindow.close();
      infoWindow.open(googleMap, marker);
      currentGoogleInfoWindow = infoWindow;
      selectOffice(office.id);
    });

    googleMarkers[office.id] = { marker, infoWindow };
  });
}

function fallbackToLeafletOrSketch() {
  console.warn('Falling back to OpenStreetMap / Blueprint sketch view.');
  initMap();
}

window.fallbackToLeafletOrSketch = fallbackToLeafletOrSketch;

// Leaflet OpenStreetMap Fallback
function initMap() {
  const mapElement = document.getElementById('office-location-map');
  if (!mapElement) return;

  if (typeof L === 'undefined') {
    setMapMode('sketch');
    return;
  }

  if (mapElement.offsetHeight === 0) {
    mapElement.style.minHeight = '480px';
  }

  try {
    if (!leafletMap) {
      leafletMap = L.map('office-location-map', {
        zoomControl: true,
        scrollWheelZoom: true
      }).setView([12.8, 78.3], 6);

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(leafletMap);

      renderMapMarkers();
    } else {
      leafletMap.invalidateSize();
      renderMapMarkers();
    }
  } catch (err) {
    console.error('Leaflet initialization exception:', err);
    setMapMode('sketch');
  }
}

function renderMapMarkers() {
  if (!leafletMap || typeof L === 'undefined') return;

  Object.values(mapMarkers).forEach(m => leafletMap.removeLayer(m));
  mapMarkers = {};

  state.offices.forEach(office => {
    const isSelected = office.id === selectedOfficeId;

    const customIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div class="relative group cursor-pointer">
          <div class="w-8 h-8 rounded-full ${isSelected ? 'bg-amber-500 scale-125 ring-4 ring-amber-300' : 'bg-blue-600 ring-2 ring-white'} text-white flex items-center justify-center font-bold text-xs shadow-lg transition-transform duration-200">
            ${office.number}
          </div>
          <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 ${isSelected ? 'bg-amber-500' : 'bg-blue-600'} rotate-45"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });

    const marker = L.marker([office.lat, office.lng], { icon: customIcon }).addTo(leafletMap);
    const totalStock = getOfficeTotalStock(office.id);
    const staff = getOfficeStaff(office.id);
    const staffPhone = (staff && staff.phone) || office.staffPhone || '';
    const staffEmail = (staff && staff.email) || office.staffEmail || '';

    marker.bindPopup(`
      <div class="p-1 font-sans text-xs min-w-[190px]">
        <div class="font-bold text-sm text-blue-700 mb-1">Pin #${office.number}: ${escapeHtml(office.name)}</div>
        <p class="text-slate-600 mb-0.5"><strong>Staff:</strong> ${escapeHtml(staff ? staff.name : (office.staffName || 'Staff'))}</p>
        ${staffPhone ? `<p class="text-slate-500 mb-0.5">📞 ${escapeHtml(staffPhone)}</p>` : ''}
        ${staffEmail ? `<p class="text-slate-500 mb-1">✉ ${escapeHtml(staffEmail)}</p>` : ''}
        <p class="text-slate-600 mb-2"><strong>Total Components:</strong> <span class="font-bold text-emerald-600">${totalStock} units</span></p>
        ${office.googleMapsUrl ? `
          <a href="${escapeHtml(office.googleMapsUrl)}" target="_blank" rel="noopener noreferrer" class="w-full block text-center bg-slate-100 dark:bg-slate-800 text-blue-600 border border-slate-300 py-1 px-2 rounded mb-1 font-bold text-[10px] hover:bg-slate-200">
            Open in Google Maps ↗
          </a>
        ` : ''}
        <div class="flex gap-1">
          <button onclick="selectOffice('${office.id}')" class="flex-1 bg-blue-600 text-white font-semibold py-1 px-2 rounded text-center block hover:bg-blue-700">
            View Components &rarr;
          </button>
          <button onclick="deleteOffice('${office.id}')" class="bg-red-50 text-red-600 border border-red-200 py-1 px-2 rounded font-bold text-[11px] hover:bg-red-100" title="Delete this Office">
            Del
          </button>
        </div>
      </div>
    `);

    marker.on('click', () => {
      selectOffice(office.id);
    });

    mapMarkers[office.id] = marker;
  });
}

// -------------------------------------------------------------
// BLUEPRINT SKETCH MAP (Interactive Vector Map Matching User's Drawing)
// -------------------------------------------------------------
function renderSketchMap() {
  const container = document.getElementById('office-sketch-map');
  if (!container) return;

  // Approximate relative coordinates for peninsular South India (matching user's drawing)
  const cityPositions = {
    'Chennai': { x: 330, y: 155 },
    'Bengaluru': { x: 235, y: 165 },
    'Coimbatore': { x: 195, y: 245 },
    'Hyderabad': { x: 275, y: 65 },
    'Kochi': { x: 160, y: 290 },
    'Madurai': { x: 225, y: 285 },
    'Salem': { x: 235, y: 215 },
    'Tiruchirappalli': { x: 260, y: 240 },
    'Tirunelveli': { x: 215, y: 325 }
  };

  let pinsSvg = '';
  let linesSvg = '';
  let emptyMsgSvg = '';

  if (state.offices.length === 0) {
    emptyMsgSvg = `
      <rect x="70" y="170" width="320" height="54" rx="10" fill="rgba(15, 23, 42, 0.9)" stroke="rgba(56, 189, 248, 0.5)" stroke-width="1.5" />
      <text x="230" y="193" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="bold" font-family="sans-serif">No Branch Office Pins Plotted Yet</text>
      <text x="230" y="210" text-anchor="middle" fill="#93c5fd" font-size="10" font-family="sans-serif">Tap "New" &rarr; "Office / Map Pin" to add your first branch</text>
    `;
  } else {
    // Connecting lines between plotted offices
    linesSvg += `
      <path d="M 275 65 L 235 165 L 330 155 L 235 165 L 195 245 L 160 290" 
            stroke="rgba(59, 130, 246, 0.4)" stroke-dasharray="4,4" stroke-width="2" fill="none" />
    `;
  }

  state.offices.forEach((office, idx) => {
    let pos = cityPositions[office.city];
    if (!pos) {
      // Dynamic fallback placement based on lat/lng
      pos = {
        x: Math.min(380, Math.max(80, (office.lng - 74) * 50 + 100)),
        y: Math.min(380, Math.max(40, (19 - office.lat) * 35 + 40))
      };
    }

    const isSelected = office.id === selectedOfficeId;
    const total = getOfficeTotalStock(office.id);

    pinsSvg += `
      <g onclick="selectOffice('${office.id}')" class="cursor-pointer group" transform="translate(${pos.x}, ${pos.y})">
        <!-- Glow ring if selected -->
        ${isSelected ? '<circle r="22" fill="rgba(245, 158, 11, 0.25)" class="animate-ping" />' : ''}
        
        <!-- Pin Base Circle -->
        <circle r="16" fill="${isSelected ? '#f59e0b' : '#2563eb'}" stroke="#ffffff" stroke-width="2.5" class="shadow-lg transition-transform group-hover:scale-125" />
        
        <!-- Pin Number text -->
        <text y="4" text-anchor="middle" fill="#ffffff" font-size="11" font-weight="900" font-family="sans-serif">${office.number}</text>
        
        <!-- Pin Label Box -->
        <rect x="22" y="-12" width="110" height="24" rx="6" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(255,255,255,0.2)" />
        <text x="28" y="0" fill="#ffffff" font-size="10" font-weight="bold" font-family="sans-serif">${escapeHtml(office.city)}</text>
        <text x="28" y="9" fill="#93c5fd" font-size="8" font-family="sans-serif">${total} units</text>
      </g>
    `;
  });

  container.innerHTML = `
    <div class="relative w-full h-full flex flex-col items-center justify-center p-4">
      
      <!-- SVG Canvas representing South India Peninsula matching drawing -->
      <svg viewBox="0 0 460 400" class="w-full h-full max-h-[500px] select-none filter drop-shadow-xl">
        <!-- Grid Blueprint Lines -->
        <defs>
          <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
            <path d="M 25 0 L 0 0 0 25" fill="none" stroke="rgba(255, 255, 255, 0.05)" stroke-width="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        <!-- South India Peninsula Coastline Outline (drawn from user's blueprint sketch) -->
        <path d="M 70 30 
                 Q 120 70 140 120 
                 Q 160 210 155 290 
                 Q 180 340 215 375
                 Q 250 340 320 230
                 Q 360 170 340 120
                 Q 320 70 390 30" 
              fill="rgba(30, 41, 59, 0.6)" 
              stroke="#38bdf8" 
              stroke-width="3" 
              stroke-dasharray="6,4" />

        <!-- Water Labels -->
        <text x="40" y="240" fill="rgba(255,255,255,0.25)" font-size="11" font-weight="bold" letter-spacing="2">ARABIAN SEA</text>
        <text x="310" y="270" fill="rgba(255,255,255,0.25)" font-size="11" font-weight="bold" letter-spacing="2">BAY OF BENGAL</text>
        <text x="175" y="395" fill="rgba(255,255,255,0.25)" font-size="10" font-weight="bold" letter-spacing="1">INDIAN OCEAN</text>

        <!-- Inter-office route links -->
        ${linesSvg}

        <!-- Numbered Office Pins -->
        ${pinsSvg}

        <!-- Empty State Message if 0 offices -->
        ${emptyMsgSvg}
      </svg>

      <div class="absolute bottom-3 left-4 text-[11px] text-slate-400 bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-2">
        <span class="w-2 h-2 rounded-full ${state.offices.length === 0 ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}"></span>
        <span>${state.offices.length === 0 ? 'Clean Database • Tap "New" on the left menu to add Offices & Components' : 'Interactive Blueprint View • Tap any pin to view components'}</span>
      </div>
    </div>
  `;
}

// Map Mode Switcher (Google Maps vs Blueprint Sketch)
function setMapMode(mode) {
  currentMapMode = mode;
  const osmDiv = document.getElementById('office-location-map');
  const sketchDiv = document.getElementById('office-sketch-map');
  const btnOsm = document.getElementById('map-mode-osm');
  const btnSketch = document.getElementById('map-mode-sketch');

  if (mode === 'google') {
    if (osmDiv) osmDiv.classList.remove('hidden');
    if (sketchDiv) sketchDiv.classList.add('hidden');
    if (btnOsm) {
      btnOsm.classList.add('bg-blue-600', 'text-white');
      btnOsm.classList.remove('text-slate-600', 'hover:bg-slate-100', 'dark:text-slate-300');
    }
    if (btnSketch) {
      btnSketch.classList.remove('bg-blue-600', 'text-white');
      btnSketch.classList.add('text-slate-600', 'hover:bg-slate-100', 'dark:text-slate-300');
    }
    setTimeout(() => {
      if (typeof google !== 'undefined' && google.maps) {
        initGoogleMap();
        if (googleMap) {
          google.maps.event.trigger(googleMap, 'resize');
          const off = state.offices.find(o => o.id === selectedOfficeId);
          if (off) googleMap.panTo({ lat: off.lat, lng: off.lng });
        }
      } else {
        initMap();
        if (leafletMap) leafletMap.invalidateSize();
      }
    }, 150);
  } else {
    if (osmDiv) osmDiv.classList.add('hidden');
    if (sketchDiv) sketchDiv.classList.remove('hidden');
    if (btnSketch) {
      btnSketch.classList.add('bg-blue-600', 'text-white');
      btnSketch.classList.remove('text-slate-600', 'hover:bg-slate-100', 'dark:text-slate-300');
    }
    if (btnOsm) {
      btnOsm.classList.remove('bg-blue-600', 'text-white');
      btnOsm.classList.add('text-slate-600', 'hover:bg-slate-100', 'dark:text-slate-300');
    }
    renderSketchMap();
  }
}

function selectOffice(officeId) {
  selectedOfficeId = officeId;
  renderApp();

  const office = state.offices.find(o => o.id === officeId);
  if (office) {
    if (googleMap && currentMapMode === 'google') {
      googleMap.panTo({ lat: office.lat, lng: office.lng });
      if (typeof googleMap.getZoom === 'function' && googleMap.getZoom() < 14) {
        googleMap.setZoom(15);
      }
      if (googleMarkers[officeId]) {
        if (currentGoogleInfoWindow) currentGoogleInfoWindow.close();
        googleMarkers[officeId].infoWindow.open(googleMap, googleMarkers[officeId].marker);
        currentGoogleInfoWindow = googleMarkers[officeId].infoWindow;
      }
    } else if (leafletMap) {
      leafletMap.setView([office.lat, office.lng], 15, { animate: true });
      if (mapMarkers[officeId]) {
        mapMarkers[officeId].openPopup();
      }
    }
  }

  renderGoogleMarkers();
  renderMapMarkers();
  renderSketchMap();
}

// Office & Component Deletion
function deleteOffice(officeId) {
  const office = state.offices.find(o => o.id === officeId);
  if (!office) return;

  if (confirm(`Are you sure you want to delete "${office.name}" (Pin #${office.number})?\n\nThis will remove its map pin, staff record, and inventory stock.`)) {
    // Remove office
    state.offices = state.offices.filter(o => o.id !== officeId);

    // Re-number remaining offices sequentially
    state.offices.forEach((o, idx) => {
      o.number = idx + 1;
    });

    // Remove staff associated with this office
    state.staff = state.staff.filter(s => s.officeId !== officeId);

    // Remove office from stock matrix
    Object.keys(state.stocks).forEach(cId => {
      if (state.stocks[cId] && state.stocks[cId][officeId] !== undefined) {
        delete state.stocks[cId][officeId];
      }
    });

    // If currently selected office was deleted, switch to the first office or null
    if (selectedOfficeId === officeId) {
      selectedOfficeId = state.offices.length > 0 ? state.offices[0].id : null;
    }

    saveData();
    renderApp();
    renderGoogleMarkers();
    renderMapMarkers();
    renderSketchMap();
    showToast(`Office "${office.name}" deleted successfully.`, 'info');
  }
}

function deleteComponent(componentId) {
  const comp = state.components.find(c => c.id === componentId);
  if (!comp) return;

  if (confirm(`Are you sure you want to delete component "${comp.name}" (${comp.code}) from the entire inventory?`)) {
    state.components = state.components.filter(c => c.id !== componentId);
    if (state.stocks[componentId]) {
      delete state.stocks[componentId];
    }
    saveData();
    renderApp();
    showToast(`Component "${comp.name}" deleted.`, 'info');
  }
}

window.deleteOffice = deleteOffice;
window.deleteComponent = deleteComponent;

// Stock Helpers
function getStock(componentId, officeId) {
  if (!state.stocks[componentId]) return 0;
  return Number(state.stocks[componentId][officeId] || 0);
}

function setStock(componentId, officeId, count) {
  if (!state.stocks[componentId]) {
    state.stocks[componentId] = {};
  }
  state.stocks[componentId][officeId] = Math.max(0, Number(count));
}

function getOfficeTotalStock(officeId) {
  let sum = 0;
  state.components.forEach(c => {
    sum += getStock(c.id, officeId);
  });
  return sum;
}

function getOfficeStaff(officeId) {
  const office = state.offices.find(o => o.id === officeId);
  if (!office) return null;
  return state.staff.find(s => s.id === office.staffId) || null;
}

// Master Render
function renderApp() {
  if (state.currentUser && state.currentUser.role === 'Staff') {
    renderStaffPortal();
  } else {
    renderOfficeList();
    renderPerOfficeComponentList();
    renderAskPanel();
    renderHistoryView();
    renderNewModalDynamicFields();
  }
  updatePendingBadges();
  renderStaffDirectory();
  renderLoginStaffQuickList();
  if (window.lucide) lucide.createIcons();
}

// -------------------------------------------------------------
// DEDICATED STAFF PORTAL IMPLEMENTATION
// ("they only ask and see the compuent list only")
// -------------------------------------------------------------

function renderStaffPortal() {
  if (!state.currentUser || state.currentUser.role !== 'Staff') return;

  const staff = state.staff.find(s => s.id === state.currentUser.staffId) || state.currentUser;
  const office = state.offices.find(o => o.id === staff.officeId) || state.offices[0];

  // Update staff header displays
  const staffNameHeader = document.getElementById('staff-user-name-display');
  const staffOfficeHeader = document.getElementById('staff-user-office-display');
  if (staffNameHeader) staffNameHeader.textContent = staff.name || 'Staff Member';
  if (staffOfficeHeader) staffOfficeHeader.textContent = office ? `${office.name} (Pin #${office.number})` : 'Unassigned Branch';

  // Render Office Banner
  const banner = document.getElementById('staff-office-banner');
  if (banner) {
    if (office) {
      const totalStock = getOfficeTotalStock(office.id);
      banner.innerHTML = `
        <div class="flex items-center gap-4 min-w-0">
          <div class="w-14 h-14 rounded-2xl bg-white dark:bg-slate-800 p-1.5 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center flex-shrink-0 overflow-hidden">
            <img src="${COMPANY_LOGO_URL}" alt="Company Logo" class="w-full h-full object-contain">
          </div>
          <div class="space-y-1.5 min-w-0">
            <div class="flex items-center gap-2">
            <span class="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              Pin #${office.number}
            </span>
            <h2 class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white truncate">
              ${escapeHtml(office.name)}
            </h2>
          </div>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <span class="flex items-center gap-1 font-medium">
              <i data-lucide="user" class="w-3.5 h-3.5 text-emerald-600"></i>
              ${escapeHtml(staff.name)} (${escapeHtml(staff.role || 'Office Staff')})
            </span>
            ${staff.phone ? `
              <span class="flex items-center gap-1 text-slate-500">
                <i data-lucide="phone" class="w-3.5 h-3.5 text-slate-400"></i>
                ${escapeHtml(staff.phone)}
              </span>
            ` : ''}
            ${staff.email ? `
              <span class="flex items-center gap-1 text-slate-500">
                <i data-lucide="mail" class="w-3.5 h-3.5 text-slate-400"></i>
                ${escapeHtml(staff.email)}
              </span>
            ` : ''}
          </div>
          ${office.googleMapsUrl ? `
            <div class="pt-1">
              <a href="${escapeHtml(office.googleMapsUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline">
                <i data-lucide="map-pin" class="w-3.5 h-3.5 text-red-500"></i>
                <span>Google Maps Location ↗</span>
              </a>
            </div>
          ` : ''}
          </div>
        </div>

        <div class="flex items-center gap-3 flex-shrink-0 self-start sm:self-auto">
          <div class="bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900/60 px-4 py-2 rounded-2xl text-center">
            <span class="block text-[10px] uppercase font-bold text-blue-500 tracking-wider">Branch Stock</span>
            <span class="text-lg font-black text-blue-700 dark:text-blue-300 font-mono">${totalStock}</span>
            <span class="block text-[10px] text-slate-400">units</span>
          </div>
          <button onclick="openStaffAskModal()" class="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold shadow-lg shadow-blue-600/30 flex items-center gap-2 cursor-pointer transition">
            <i data-lucide="hand" class="w-4 h-4"></i>
            <span>Ask / Request</span>
          </button>
        </div>
      `;
    } else {
      banner.innerHTML = `
        <div class="p-4 bg-amber-50 dark:bg-amber-950/40 rounded-2xl border border-amber-200 text-xs text-amber-800 dark:text-amber-300">
          <strong>Notice:</strong> Your staff account is not assigned to an active branch office yet. Please request your Admin to assign you an office.
        </div>
      `;
    }
  }

  // Render Components List for Staff ("Ask Admin for Components List")
  // Contains: Image, Component Name, Component Number, Office Stock, Count Needed, Reason, Action
  const grid = document.getElementById('staff-components-grid');
  if (grid) {
    if (!office || state.components.length === 0) {
      grid.innerHTML = `
        <div class="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl p-6">
          <i data-lucide="cpu" class="w-10 h-10 mx-auto mb-2 text-slate-400"></i>
          <p class="text-sm font-bold text-slate-700 dark:text-slate-300">No Components Found</p>
          <p class="text-xs text-slate-400 mt-1">There are no components registered in the system yet. Admin can add components in "New".</p>
        </div>
      `;
    } else {
      grid.innerHTML = `
        <div class="space-y-2.5">
          <!-- Desktop Table Header matching user prompt: Image, Component Name, Component Number, Count Needed, Reason, Action -->
          <div class="hidden md:grid md:grid-cols-12 gap-3 px-4 py-2.5 bg-slate-100/90 dark:bg-slate-800/80 rounded-2xl text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/80 items-center">
            <div class="col-span-1 text-center">Image</div>
            <div class="col-span-3">Component Name</div>
            <div class="col-span-2">Component Number</div>
            <div class="col-span-2 text-center">Count Needed</div>
            <div class="col-span-3">Reason</div>
            <div class="col-span-1 text-right">Action</div>
          </div>

          <!-- Component Rows List -->
          <div id="staff-comp-rows-container" class="space-y-2.5">
            ${state.components.map(comp => {
              const stock = getStock(comp.id, office.id);
              return `
                <div class="staff-comp-row bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 transition shadow-xs p-3.5 flex flex-col md:grid md:grid-cols-12 gap-3 items-center text-xs">
                  <!-- 1. Image -->
                  <div class="col-span-1 flex justify-center flex-shrink-0">
                    <div class="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center flex-shrink-0 shadow-xs">
                      ${comp.image 
                        ? `<img src="${comp.image}" alt="${escapeHtml(comp.name)}" class="w-full h-full object-cover">` 
                        : `<span class="text-[9px] font-bold text-slate-400">IMAGE</span>`
                      }
                    </div>
                  </div>

                  <!-- 2. Component Name -->
                  <div class="col-span-3 min-w-0 w-full pr-1">
                    <span class="text-[9px] uppercase font-bold text-slate-400 tracking-wider md:hidden block">Component Name</span>
                    <h4 class="font-extrabold text-slate-900 dark:text-white text-xs truncate" title="${escapeHtml(comp.name)}">
                      ${escapeHtml(comp.name)}
                    </h4>
                    <div class="flex items-center gap-1.5 mt-0.5">
                      <span class="text-[10px] text-slate-400">Branch Stock:</span>
                      <span class="font-mono font-bold text-[10px] ${stock > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}">
                        ${stock} ${comp.unit || 'units'}
                      </span>
                    </div>
                  </div>

                  <!-- 3. Component Number -->
                  <div class="col-span-2 min-w-0 w-full">
                    <span class="text-[9px] uppercase font-bold text-slate-400 tracking-wider md:hidden block">Component Number</span>
                    <span class="font-mono font-bold text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/80 px-2 py-0.5 rounded-lg border border-blue-200/80 dark:border-blue-900/60 inline-block">
                      ${escapeHtml(comp.code)}
                    </span>
                  </div>

                  <!-- 4. Count Needed -->
                  <div class="col-span-2 flex flex-col items-center justify-center w-full">
                    <span class="text-[9px] uppercase font-bold text-slate-400 tracking-wider md:hidden block mb-1">Count Needed</span>
                    <div class="flex items-center gap-1">
                      <button type="button" onclick="adjustCount('staff-row-qty-${comp.id}', -1)" class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold cursor-pointer transition">-</button>
                      <input 
                        type="number" 
                        min="0" 
                        value="0" 
                        id="staff-row-qty-${comp.id}" 
                        data-component-id="${comp.id}"
                        class="staff-row-count-input w-14 p-1.5 text-center font-bold text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 font-mono"
                        placeholder="0"
                      >
                      <button type="button" onclick="adjustCount('staff-row-qty-${comp.id}', 1)" class="w-7 h-7 flex items-center justify-center rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold cursor-pointer transition">+</button>
                    </div>
                  </div>

                  <!-- 5. Reason -->
                  <div class="col-span-3 min-w-0 w-full">
                    <span class="text-[9px] uppercase font-bold text-slate-400 tracking-wider md:hidden block mb-1">Reason</span>
                    <input 
                      type="text" 
                      id="staff-row-reason-${comp.id}" 
                      data-component-id="${comp.id}"
                      placeholder="Reason for needing component..." 
                      class="staff-row-reason-input w-full text-xs p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500"
                    >
                  </div>

                  <!-- 6. Action: Ask Admin -->
                  <div class="col-span-1 flex justify-end w-full md:w-auto">
                    <button 
                      type="button" 
                      onclick="staffAskFromRow('${comp.id}')" 
                      class="w-full md:w-auto inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
                      title="Ask Admin to send this component"
                    >
                      <i data-lucide="send" class="w-3 h-3"></i>
                      <span>Ask</span>
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }
  }

  // const reqContainer = document.getElementById('staff-requisitions-container');
  if (reqContainer) {
    const myRequests = (state.askRequests || []).filter(r => r.officeId === office?.id || (staff && staff.name && r.staffName === staff.name));
    if (myRequests.length === 0) {
      reqContainer.innerHTML = `
        <div class="text-center py-6 text-slate-400 text-xs">
          <i data-lucide="inbox" class="w-7 h-7 mx-auto mb-1 opacity-40"></i>
          <p class="font-semibold text-slate-600 dark:text-slate-300">No Component Requests Sent Yet</p>
          <p class="text-[11px] text-slate-400 mt-0.5">Enter count needed and reason above and click "Ask Admin" to request components for this branch.</p>
        </div>
      `;
    } else {
      reqContainer.innerHTML = myRequests.map(r => {
        const isSent = r.status === 'Sent by Admin' || r.status === 'Fulfilled';
        const isDeclined = r.status === 'Declined';
        const isPending = !isSent && !isDeclined;

        let badgeHtml = '';
        if (isSent) {
          badgeHtml = `
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              <i data-lucide="check-circle" class="w-3 h-3 text-emerald-600"></i>
              <span>✓ Sent by Admin (Received)</span>
            </span>
          `;
        } else if (isDeclined) {
          badgeHtml = `
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-200">
              <i data-lucide="x-circle" class="w-3 h-3 text-red-600"></i>
              <span>Declined by Admin</span>
            </span>
          `;
        } else {
          badgeHtml = `
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700 animate-pulse">
              <i data-lucide="clock" class="w-3 h-3 text-amber-600"></i>
              <span>⏳ Waiting for Admin to Send</span>
            </span>
          `;
        }

        return `
          <div class="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border ${isPending ? 'border-amber-200 dark:border-amber-800/50' : isSent ? 'border-emerald-200 dark:border-emerald-800/50' : 'border-slate-200 dark:border-slate-700'} space-y-3 shadow-sm text-xs">
            <div class="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-700/60">
              <div class="text-[11px] text-slate-500">
                Requested on <strong class="text-slate-800 dark:text-slate-200">${new Date(r.date).toLocaleString()}</strong>
              </div>
              <div>${badgeHtml}</div>
            </div>

            <!-- List of Components Asked in this Request (matching prompt: Image, Component Name, Component Number, Count Needed, Reason) -->
            <div class="space-y-1.5">
              ${r.items.map(it => {
                const comp = state.components.find(c => c.id === it.componentId);
                const itemReason = it.reason || r.note || 'None specified';
                return `
                  <div class="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 gap-3">
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-shrink-0 flex items-center justify-center shadow-xs">
                        ${comp && comp.image ? `<img src="${comp.image}" class="w-full h-full object-cover">` : `<span class="text-[9px] font-bold text-slate-400">PART</span>`}
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="font-bold text-slate-900 dark:text-white truncate">${escapeHtml(comp ? comp.name : 'Unknown Component')}</span>
                          <span class="font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.2 rounded border border-blue-200/60">${escapeHtml(comp ? comp.code : 'CODE')}</span>
                        </div>
                        <p class="text-[11px] text-slate-500 mt-0.5"><strong class="text-slate-700 dark:text-slate-300">Reason:</strong> ${escapeHtml(itemReason)}</p>
                      </div>
                    </div>
                    <div class="text-right flex-shrink-0">
                      <span class="font-mono font-black text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-lg border border-blue-200/60">
                        Count Needed: ${it.count} ${comp?.unit || 'units'}
                      </span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            ${isSent && r.sentDate ? `
              <div class="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pt-1 flex items-center gap-1.5 border-t border-slate-200/60 dark:border-slate-700/60">
                <i data-lucide="check" class="w-3.5 h-3.5"></i>
                <span>Dispatched by Admin on ${new Date(r.sentDate).toLocaleString()} &mdash; Credited to your branch inventory!</span>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }
  }

  if (window.lucide) lucide.createIcons();
}

// -------------------------------------------------------------
// STAFF DIRECT LIST ASKING HELPERS
// -------------------------------------------------------------

function staffAskFromRow(componentId) {
  const staff = (state.currentUser && state.currentUser.role === 'Staff')
    ? (state.staff.find(s => s.id === state.currentUser.staffId) || state.currentUser)
    : null;
  const office = staff ? (state.offices.find(o => o.id === staff.officeId) || state.offices[0]) : (state.offices.find(o => o.id === selectedOfficeId) || state.offices[0]);

  if (!office) {
    alert('No branch office assigned to this account.');
    return;
  }

  const comp = state.components.find(c => c.id === componentId);
  if (!comp) return;

  const countInput = document.getElementById(`staff-row-qty-${componentId}`);
  const reasonInput = document.getElementById(`staff-row-reason-${componentId}`);

  let count = parseInt(countInput?.value, 10) || 0;
  let reason = reasonInput ? reasonInput.value.trim() : '';

  if (count <= 0) {
    const promptCount = prompt(`Enter Count Needed for ${comp.name} (${comp.code}):`, "1");
    if (!promptCount) return;
    count = parseInt(promptCount, 10) || 0;
    if (count <= 0) {
      alert('Please enter a valid count greater than 0.');
      return;
    }
  }

  if (!reason) {
    const promptReason = prompt(`Enter Reason for asking ${comp.name}:`, "Urgent repair / Project requirement");
    if (promptReason !== null) {
      reason = promptReason.trim();
    }
  }

  const newAsk = {
    id: 'ask-' + Date.now(),
    date: new Date().toISOString(),
    officeId: office.id,
    officeName: office.name,
    staffName: staff ? staff.name : 'Staff Member',
    status: 'Pending',
    items: [
      {
        componentId: componentId,
        count: count,
        reason: reason || 'Branch requirement'
      }
    ],
    note: reason || `Requested ${count}x ${comp.name}`
  };

  state.askRequests.unshift(newAsk);
  saveData();

  if (countInput) countInput.value = '0';
  if (reasonInput) reasonInput.value = '';

  renderApp();
  renderAskPanel();
  showToast(`✓ Requested ${count}x ${comp.name} from Admin!`, 'success');
}

function staffBulkAskFromList() {
  const staff = (state.currentUser && state.currentUser.role === 'Staff')
    ? (state.staff.find(s => s.id === state.currentUser.staffId) || state.currentUser)
    : null;
  const office = staff ? (state.offices.find(o => o.id === staff.officeId) || state.offices[0]) : (state.offices.find(o => o.id === selectedOfficeId) || state.offices[0]);

  if (!office) {
    alert('No office assigned to this account.');
    return;
  }

  const items = [];
  document.querySelectorAll('.staff-row-count-input').forEach(input => {
    const count = parseInt(input.value, 10) || 0;
    if (count > 0) {
      const compId = input.dataset.componentId;
      const reasonInput = document.getElementById(`staff-row-reason-${compId}`);
      const reason = reasonInput ? reasonInput.value.trim() : '';
      items.push({
        componentId: compId,
        count: count,
        reason: reason || 'Branch requirement'
      });
    }
  });

  if (items.length === 0) {
    alert('Please enter Count Needed greater than 0 for at least one component in the list.');
    return;
  }

  const newAsk = {
    id: 'ask-' + Date.now(),
    date: new Date().toISOString(),
    officeId: office.id,
    officeName: office.name,
    staffName: staff ? staff.name : 'Staff Member',
    status: 'Pending',
    items: items,
    note: `Bulk request for ${items.length} component(s)`
  };

  state.askRequests.unshift(newAsk);
  saveData();

  document.querySelectorAll('.staff-row-count-input').forEach(i => i.value = '0');
  document.querySelectorAll('.staff-row-reason-input').forEach(i => i.value = '');

  renderApp();
  renderAskPanel();
  showToast(`✓ Successfully sent request for ${items.length} component(s) to Admin!`, 'success');
}

function openStaffAskModal(componentId = null) {
  const staff = (state.currentUser && state.currentUser.role === 'Staff')
    ? (state.staff.find(s => s.id === state.currentUser.staffId) || state.currentUser)
    : null;

  const office = staff 
    ? (state.offices.find(o => o.id === staff.officeId) || state.offices[0]) 
    : (state.offices.find(o => o.id === selectedOfficeId) || state.offices[0]);

  // Set modal header text
  const titleEl = document.getElementById('modal-asking-title');
  const subEl = document.getElementById('modal-asking-subtitle');
  if (titleEl) {
    titleEl.innerHTML = `
      <i data-lucide="hand" class="w-5 h-5 text-blue-600"></i>
      <span>Ask Components from Admin</span>
    `;
  }
  if (subEl) {
    subEl.textContent = 'Enter component details (Name, Number, Count, Reason, Image) and send your request to Admin.';
  }

  // Switch modal view to Staff
  const staffSection = document.getElementById('staff-ask-section');
  const adminSection = document.getElementById('admin-send-section');
  if (staffSection) staffSection.classList.remove('hidden');
  if (adminSection) adminSection.classList.add('hidden');

  // Update office and staff displays in modal
  const offDisplay = document.getElementById('staff-ask-office-display');
  const staffDisplay = document.getElementById('staff-ask-staff-display');
  const offSelect = document.getElementById('ask-office-select');
  const staffInput = document.getElementById('ask-staff-input');

  const staffNameVal = (staff && staff.name) ? staff.name : (getOfficeStaff(office?.id)?.name || 'Staff In-Charge');
  const officeNameVal = office ? `${office.name} (Pin #${office.number})` : 'Branch Office';

  if (offDisplay) offDisplay.textContent = officeNameVal;
  if (staffDisplay) staffDisplay.textContent = staffNameVal;
  if (offSelect) {
    offSelect.innerHTML = `<option value="${office ? office.id : ''}">${escapeHtml(officeNameVal)}</option>`;
    offSelect.value = office ? office.id : '';
  }
  if (staffInput) staffInput.value = staffNameVal;

  // Clear or prefill text inputs
  const nameInput = document.getElementById('staff-text-comp-name');
  const numInput = document.getElementById('staff-text-comp-number');
  const countInput = document.getElementById('staff-text-comp-count');
  const reasonInput = document.getElementById('staff-text-comp-reason');
  const imgData = document.getElementById('staff-text-comp-image-data');
  const imgPreview = document.getElementById('staff-text-img-preview');
  const imgWrap = document.getElementById('staff-text-img-preview-wrap');
  const imgLabel = document.getElementById('staff-text-img-label');

  if (!componentId) {
    currentStaffAskItems = [];
    if (nameInput) nameInput.value = '';
    if (numInput) numInput.value = '';
    if (countInput) countInput.value = '1';
    if (reasonInput) reasonInput.value = '';
    if (imgData) imgData.value = '';
    if (imgWrap) imgWrap.classList.add('hidden');
    if (imgLabel) imgLabel.textContent = 'Upload Image';
  } else {
    const targetComp = state.components.find(c => c.id === componentId);
    if (targetComp) {
      if (nameInput) nameInput.value = targetComp.name;
      if (numInput) numInput.value = targetComp.code;
      if (countInput) countInput.value = '1';
      if (reasonInput) reasonInput.value = '';
      if (imgData) imgData.value = targetComp.image || '';
      if (imgPreview && targetComp.image) imgPreview.src = targetComp.image;
      if (imgWrap && targetComp.image) imgWrap.classList.remove('hidden');
      if (imgLabel && targetComp.image) imgLabel.textContent = 'Change Image';
    }
  }

  renderStaffAskItemsList();
  renderAskPanel();
  openModal('modal-asking');
  if (window.lucide) lucide.createIcons();

  if (nameInput && !componentId) {
    setTimeout(() => nameInput.focus(), 150);
  } else if (countInput && componentId) {
    setTimeout(() => countInput.focus(), 150);
  }
}

function openAdminRequestsModal() {
  const titleEl = document.getElementById('modal-asking-title');
  const subEl = document.getElementById('modal-asking-subtitle');
  if (titleEl) {
    titleEl.innerHTML = `
      <i data-lucide="package-search" class="w-5 h-5 text-blue-600"></i>
      <span>Staff Requests &bull; Send Components</span>
    `;
  }
  if (subEl) {
    subEl.textContent = 'Staff members asking Admin for components — Review and click "Send Component" to dispatch parts to the branch';
  }

  const staffSection = document.getElementById('staff-ask-section');
  const adminSection = document.getElementById('admin-send-section');
  if (staffSection) staffSection.classList.add('hidden');
  if (adminSection) adminSection.classList.remove('hidden');

  switchAdminAskTab('pending');
  renderAskPanel();
  openModal('modal-asking');
  if (window.lucide) lucide.createIcons();
}

function openStaffAskModalForComponent(componentId) {
  openStaffAskModal(componentId);
}

function renderStaffDirectory() {
  const container = document.getElementById('staff-directory-list');
  if (!container) return;

  if (!state.staff || state.staff.length === 0) {
    container.innerHTML = `
      <div class="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-center text-xs text-slate-400 italic">
        No staff accounts created yet. When you add branch offices or staff, their login details will appear here.
      </div>
    `;
    return;
  }

  container.innerHTML = state.staff.map(s => {
    const off = state.offices.find(o => o.id === s.officeId);
    const loginUser = s.email || s.username || s.name;
    const loginPass = s.password || 'staff123';
    return `
      <div class="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2 text-xs">
        <div class="min-w-0">
          <div class="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <i data-lucide="user" class="w-3.5 h-3.5 text-emerald-500"></i>
            <span>${escapeHtml(s.name)}</span>
            <span class="text-[10px] font-normal text-slate-400">(${escapeHtml(s.role || 'Staff')})</span>
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            🏢 <strong>Branch:</strong> ${off ? escapeHtml(off.name) + ` (Pin #${off.number})` : 'Unassigned'}
          </div>
          <div class="text-[11px] font-mono text-slate-600 dark:text-slate-300 mt-1 flex flex-wrap gap-x-3">
            <span>👤 Username/Email: <strong class="text-blue-600 dark:text-blue-400">${escapeHtml(loginUser)}</strong></span>
            <span>🔑 Password: <strong class="text-emerald-600 dark:text-emerald-400">${escapeHtml(loginPass)}</strong></span>
          </div>
        </div>
        <button 
          type="button" 
          onclick="fillLoginAndSwitch('${escapeHtml(loginUser)}', '${escapeHtml(loginPass)}')" 
          class="flex-shrink-0 px-2.5 py-1 bg-white dark:bg-slate-700 hover:bg-blue-50 dark:hover:bg-slate-600 text-blue-600 dark:text-blue-300 border border-slate-200 dark:border-slate-600 rounded-lg text-[11px] font-bold shadow-sm cursor-pointer"
          title="Switch to this staff login"
        >
          Test Login &rarr;
        </button>
      </div>
    `;
  }).join('');
}

window.openStaffAskModal = openStaffAskModal;
window.openStaffAskModalForComponent = openStaffAskModalForComponent;
window.renderStaffPortal = renderStaffPortal;
window.renderStaffDirectory = renderStaffDirectory;

// Right Panel: Office List (1, 2, 3...)
function renderOfficeList() {
  const container = document.getElementById('office-list-container');
  if (!container) return;

  if (state.offices.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4 px-2 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/40">
        <i data-lucide="map-pin-off" class="w-5 h-5 mx-auto mb-1 text-slate-400"></i>
        <p class="text-xs font-bold text-slate-700 dark:text-slate-300">No Offices Yet</p>
        <p class="text-[10px] text-slate-400 mb-2">Add your first branch office pin on map</p>
        <button onclick="openView('new'); switchNewTab('office')" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[11px] font-bold shadow-sm inline-flex items-center gap-1">
          <i data-lucide="plus" class="w-3 h-3"></i> Add Office Pin
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = state.offices.map(office => {
    const isSelected = office.id === selectedOfficeId;
    const totalCount = getOfficeTotalStock(office.id);
    const staff = getOfficeStaff(office.id);
    const staffPhone = (staff && staff.phone) || office.staffPhone || '';

    return `
      <div 
        onclick="selectOffice('${office.id}')"
        class="cursor-pointer p-2.5 rounded-xl border transition-all duration-200 ${
          isSelected 
            ? 'bg-blue-50/90 dark:bg-blue-950/50 border-blue-500 shadow-sm ring-1 ring-blue-500' 
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
        }"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="w-7 h-7 rounded-lg ${isSelected ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-300' : 'bg-blue-600 text-white'} font-bold text-xs flex items-center justify-center flex-shrink-0">
              ${office.number}
            </span>
            <div class="min-w-0">
              <h4 class="font-bold text-xs sm:text-sm text-slate-900 dark:text-white leading-tight truncate">${escapeHtml(office.name)}</h4>
              <p class="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                <i data-lucide="user" class="w-3 h-3 text-slate-400 flex-shrink-0"></i>
                <span class="truncate">${escapeHtml(staff ? staff.name : (office.staffName || 'Staff'))}</span>
                ${staffPhone ? `<span class="text-slate-400">• ${escapeHtml(staffPhone)}</span>` : ''}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <div class="text-right">
              <span class="text-xs font-black text-blue-600 dark:text-blue-400">${totalCount}</span>
              <span class="block text-[10px] text-slate-400 font-medium">units</span>
            </div>
            <button 
              onclick="event.stopPropagation(); deleteOffice('${office.id}')" 
              title="Delete this office"
              class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/60 rounded-lg transition"
            >
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Right Panel: Per Office Components
function renderPerOfficeComponentList() {
  const officeHeader = document.getElementById('selected-office-header');
  const container = document.getElementById('per-office-components-container');
  if (!container || !officeHeader) return;

  if (state.offices.length === 0) {
    officeHeader.innerHTML = `
      <div class="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900 text-xs">
        <span class="font-bold text-blue-700 dark:text-blue-300 block mb-0.5">Clean Database Ready</span>
        <span class="text-slate-500 dark:text-slate-400">Welcome to AURORA LOC. Add your first branch office pin to start tracking components.</span>
      </div>
    `;

    container.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
        <div class="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950 flex items-center justify-center text-blue-600 mb-3">
          <i data-lucide="building" class="w-6 h-6"></i>
        </div>
        <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">No Branch Offices Found</h3>
        <p class="text-xs text-slate-400 max-w-xs mb-4">Click "New" to plot your company's branch offices on the map and assign staff.</p>
        <button onclick="openView('new'); switchNewTab('office')" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md inline-flex items-center gap-1.5">
          <i data-lucide="plus" class="w-4 h-4"></i>
          <span>Add Office Pin</span>
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const currentOffice = state.offices.find(o => o.id === selectedOfficeId) || state.offices[0];
  if (!currentOffice) return;
  selectedOfficeId = currentOffice.id;

  const staff = getOfficeStaff(currentOffice.id);
  const staffPhone = (staff && staff.phone) || currentOffice.staffPhone || '';
  const staffEmail = (staff && staff.email) || currentOffice.staffEmail || '';
  const totalOfficeUnits = getOfficeTotalStock(currentOffice.id);

  officeHeader.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
      <div class="space-y-1.5 min-w-0">
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            Pin #${currentOffice.number}
          </span>
          <h2 class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white truncate">${escapeHtml(currentOffice.name)}</h2>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
          <span class="flex items-center gap-1 font-medium">
            <i data-lucide="user-check" class="w-3.5 h-3.5 text-blue-600"></i>
            ${escapeHtml(staff ? staff.name : (currentOffice.staffName || 'Unassigned'))}
          </span>
          ${staffPhone ? `
            <span class="flex items-center gap-1 text-slate-500">
              <i data-lucide="phone" class="w-3.5 h-3.5 text-slate-400"></i>
              ${escapeHtml(staffPhone)}
            </span>
          ` : ''}
          ${staffEmail ? `
            <span class="flex items-center gap-1 text-slate-500">
              <i data-lucide="mail" class="w-3.5 h-3.5 text-slate-400"></i>
              ${escapeHtml(staffEmail)}
            </span>
          ` : ''}
        </div>
        ${currentOffice.googleMapsUrl ? `
          <div class="pt-0.5">
            <a 
              href="${escapeHtml(currentOffice.googleMapsUrl)}" 
              target="_blank" 
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
            >
              <i data-lucide="map-pin" class="w-3.5 h-3.5 text-red-500"></i>
              <span>Google Maps Location ↗</span>
            </a>
          </div>
        ` : ''}
      </div>

      <div class="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
        <span class="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-bold whitespace-nowrap">
          Total: ${totalOfficeUnits} units
        </span>
        <button onclick="openAskModalForOffice('${currentOffice.id}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm whitespace-nowrap cursor-pointer">
          <i data-lucide="hand" class="w-3.5 h-3.5"></i>
          Ask / Request
        </button>
        <button 
          onclick="deleteOffice('${currentOffice.id}')" 
          class="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/60 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm whitespace-nowrap transition cursor-pointer"
          title="Delete this Office"
        >
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          <span>Del</span>
        </button>
      </div>
    </div>
  `;

  if (state.components.length === 0) {
    container.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
        <div class="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-950 flex items-center justify-center text-purple-600 mb-3">
          <i data-lucide="cpu" class="w-6 h-6"></i>
        </div>
        <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">No Components in Inventory</h3>
        <p class="text-xs text-slate-400 max-w-xs mb-4">Add your company's component catalog (with pictures and codes) to track quantities.</p>
        <button onclick="openView('new'); switchNewTab('comp')" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-md inline-flex items-center gap-1.5">
          <i data-lucide="plus" class="w-4 h-4"></i>
          <span>Add Component</span>
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = state.components.map(comp => {
    const count = getStock(comp.id, currentOffice.id);
    const isZero = count === 0;
    const isLow = count > 0 && count <= comp.minStock;

    let badgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
    let badgeText = 'In Stock';
    if (isZero) {
      badgeClass = 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300';
      badgeText = 'Out of Stock';
    } else if (isLow) {
      badgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
      badgeText = 'Low';
    }

    return `
      <div class="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 hover:shadow-sm transition">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden flex-shrink-0 border border-slate-200 dark:border-slate-700">
            <img 
              src="${comp.image}" 
              alt="${escapeHtml(comp.name)}"
              class="w-full h-full object-cover"
              onerror="this.src='https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&auto=format&fit=crop&q=80'"
            />
          </div>
          <div class="min-w-0">
            <span class="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 block">${escapeHtml(comp.code)}</span>
            <h4 class="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate" title="${escapeHtml(comp.name)}">${escapeHtml(comp.name)}</h4>
            <span class="text-[11px] text-slate-500 dark:text-slate-400">${escapeHtml(comp.category)}</span>
          </div>
        </div>

        <div class="flex items-center gap-3 flex-shrink-0">
          <div class="text-right">
            <div class="text-base sm:text-lg font-black ${isZero ? 'text-red-500' : 'text-slate-900 dark:text-white'}">
              ${count} <span class="text-xs font-normal text-slate-400">${comp.unit}</span>
            </div>
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeClass}">
              ${badgeText}
            </span>
          </div>
          <button 
            onclick="openQuickMoveModal('${comp.id}', '${currentOffice.id}')"
            title="Move this component to another office"
            class="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/40 rounded-lg transition"
          >
            <i data-lucide="arrow-right-left" class="w-4 h-4"></i>
          </button>
          <button 
            onclick="deleteComponent('${comp.id}')"
            title="Delete this component"
            class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition"
          >
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// =========================================================
// STAFF ASKS ADMIN • ADMIN SENDS COMPONENT SYSTEM
// =========================================================

function adjustCount(inputId, delta) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const currentVal = parseInt(el.value, 10) || 0;
  el.value = Math.max(0, currentVal + delta);
}

function staffAddCompToList() {
  const nameInput = document.getElementById('staff-text-comp-name');
  const numInput = document.getElementById('staff-text-comp-number');
  const countInput = document.getElementById('staff-text-comp-count');
  const reasonInput = document.getElementById('staff-text-comp-reason');
  const imgDataInput = document.getElementById('staff-text-comp-image-data');
  const imgPreview = document.getElementById('staff-text-img-preview');
  const imgWrap = document.getElementById('staff-text-img-preview-wrap');
  const imgLabel = document.getElementById('staff-text-img-label');

  const name = nameInput ? nameInput.value.trim() : '';
  let number = numInput ? numInput.value.trim() : '';
  const count = parseInt(countInput ? countInput.value : '1', 10) || 1;
  const reason = reasonInput ? reasonInput.value.trim() : '';
  const image = (imgDataInput && imgDataInput.value) ? imgDataInput.value : DEFAULT_COMP_IMG;

  if (!name) {
    alert('Please enter a Component Name (e.g. Arduino Uno, 10k Resistor, Stepper Motor).');
    if (nameInput) nameInput.focus();
    return;
  }

  if (count <= 0) {
    alert('Please enter Count Needed greater than 0.');
    if (countInput) countInput.focus();
    return;
  }

  if (!number) {
    number = 'CMP-' + Math.floor(100 + Math.random() * 900);
  }

  const newItem = {
    id: 'item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    componentName: name,
    componentNumber: number,
    countNeeded: count,
    count: count,
    reason: reason,
    image: image
  };

  currentStaffAskItems.push(newItem);

  // Reset inputs
  if (nameInput) nameInput.value = '';
  if (numInput) numInput.value = '';
  if (countInput) countInput.value = '1';
  if (reasonInput) reasonInput.value = '';
  if (imgDataInput) imgDataInput.value = '';
  if (imgWrap) imgWrap.classList.add('hidden');
  if (imgLabel) imgLabel.textContent = 'Upload Image';

  renderStaffAskItemsList();
  showToast(`Added "${name}" to request list!`, 'info');
  if (nameInput) nameInput.focus();
}

function staffRemoveCompFromList(itemId) {
  currentStaffAskItems = currentStaffAskItems.filter(x => x.id !== itemId);
  renderStaffAskItemsList();
}

function staffClearAskList() {
  if (currentStaffAskItems.length === 0) return;
  if (confirm('Clear all components from this request list?')) {
    currentStaffAskItems = [];
    renderStaffAskItemsList();
  }
}

function renderStaffAskItemsList() {
  const container = document.getElementById('staff-ask-items-list-container');
  const countBadge = document.getElementById('staff-ask-list-count');
  const clearBtn = document.getElementById('staff-ask-clear-btn');
  const submitBtnText = document.getElementById('staff-submit-btn-text');

  if (countBadge) countBadge.textContent = currentStaffAskItems.length;

  if (clearBtn) {
    if (currentStaffAskItems.length > 0) {
      clearBtn.classList.remove('hidden');
    } else {
      clearBtn.classList.add('hidden');
    }
  }

  if (submitBtnText) {
    if (currentStaffAskItems.length > 0) {
      submitBtnText.textContent = `Send Request to Admin (${currentStaffAskItems.length} component${currentStaffAskItems.length > 1 ? 's' : ''})`;
    } else {
      submitBtnText.textContent = 'Send Request to Admin';
    }
  }

  if (!container) return;

  if (currentStaffAskItems.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 bg-white/50 dark:bg-slate-900/50">
        <i data-lucide="inbox" class="w-6 h-6 mx-auto mb-1 opacity-40"></i>
        <p class="font-bold text-slate-600 dark:text-slate-300">Your Ask List is Empty</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Fill in Component Name, Number, Count, Reason & Image above, then click "+ Add to List".</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = currentStaffAskItems.map((it) => `
    <div class="flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs text-xs gap-3">
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="w-11 h-11 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-shrink-0 flex items-center justify-center shadow-xs">
          <img src="${it.image || DEFAULT_COMP_IMG}" alt="${escapeHtml(it.componentName)}" class="w-full h-full object-cover">
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h5 class="font-extrabold text-slate-900 dark:text-white truncate">${escapeHtml(it.componentName)}</h5>
            <span class="px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950 font-mono text-[10px] font-bold text-blue-600 dark:text-blue-400 flex-shrink-0 border border-blue-200/60">${escapeHtml(it.componentNumber)}</span>
          </div>
          <div class="text-[11px] text-slate-500 truncate mt-0.5">
            ${it.reason ? `Reason: <span class="italic text-slate-700 dark:text-slate-300">"${escapeHtml(it.reason)}"</span>` : '<span class="text-slate-400 italic">No reason specified</span>'}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2.5 flex-shrink-0">
        <span class="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 font-black text-xs text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
          Qty: ${it.countNeeded}
        </span>
        <button 
          type="button" 
          onclick="staffRemoveCompFromList('${it.id}')" 
          class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition cursor-pointer" 
          title="Remove this component from list"
        >
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide) lucide.createIcons();
}

function staffSubmitAskListToAdmin() {
  const staff = (state.currentUser && state.currentUser.role === 'Staff')
    ? (state.staff.find(s => s.id === state.currentUser.staffId) || state.currentUser)
    : null;
  const office = staff ? (state.offices.find(o => o.id === staff.officeId) || state.offices[0]) : (state.offices.find(o => o.id === selectedOfficeId) || state.offices[0]);

  if (!office) {
    alert('Please ensure an office is selected or assigned.');
    return;
  }

  // If list is empty, check if staff currently typed in the input fields!
  if (currentStaffAskItems.length === 0) {
    const nameInput = document.getElementById('staff-text-comp-name');
    const name = nameInput ? nameInput.value.trim() : '';
    if (name) {
      staffAddCompToList();
    }
  }

  if (currentStaffAskItems.length === 0) {
    alert('Please enter Component Name, Component Number, and Count Needed, then click "+ Add to List" before sending.');
    const nameInput = document.getElementById('staff-text-comp-name');
    if (nameInput) nameInput.focus();
    return;
  }

  const items = currentStaffAskItems.map(it => ({
    id: it.id,
    componentId: it.componentId || null,
    componentName: it.componentName,
    componentNumber: it.componentNumber,
    countNeeded: it.countNeeded,
    count: it.countNeeded,
    reason: it.reason || 'Branch requirement',
    image: it.image || DEFAULT_COMP_IMG
  }));

  const noteSummary = items.map(it => `${it.countNeeded}x ${it.componentName}`).join(', ');

  const newAsk = {
    id: 'ask-' + Date.now(),
    date: new Date().toISOString(),
    officeId: office.id,
    officeName: office.name,
    staffName: staff ? staff.name : 'Staff In-Charge',
    status: 'Pending',
    items: items,
    note: `Staff requested: ${noteSummary}`
  };

  state.askRequests.unshift(newAsk);
  saveData();

  currentStaffAskItems = [];
  renderStaffAskItemsList();
  closeModal('modal-asking');

  renderApp();
  renderAskPanel();
  showToast(`✓ Request for ${items.length} component(s) sent to Admin! Waiting for Admin to send.`, 'success');
}

function handleAskSubmit(e) {
  if (e) e.preventDefault();
  staffSubmitAskListToAdmin();
}

function switchAdminAskTab(tabName) {
  const tabs = ['pending', 'direct', 'history'];
  tabs.forEach(t => {
    const btn = document.getElementById(`admin-ask-tab-btn-${t}`);
    const content = document.getElementById(`admin-ask-tab-content-${t}`);
    if (btn) {
      if (t === tabName) {
        btn.classList.add('bg-white', 'dark:bg-slate-900', 'text-blue-600', 'dark:text-blue-400', 'shadow-sm');
        btn.classList.remove('text-slate-600', 'dark:text-slate-400');
      } else {
        btn.classList.remove('bg-white', 'dark:bg-slate-900', 'text-blue-600', 'dark:text-blue-400', 'shadow-sm');
        btn.classList.add('text-slate-600', 'dark:text-slate-400');
      }
    }
    if (content) {
      if (t === tabName) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    }
  });
  if (window.lucide) lucide.createIcons();
}

function updatePendingBadges() {
  const pendingRequests = (state.askRequests || []).filter(r => r.status === 'Pending');
  const pendingCount = pendingRequests.length;

  const adminHeaderBadge = document.getElementById('admin-pending-req-badge');
  if (adminHeaderBadge) {
    adminHeaderBadge.textContent = pendingCount;
    if (pendingCount > 0) {
      adminHeaderBadge.classList.remove('hidden');
    } else {
      adminHeaderBadge.classList.add('hidden');
    }
  }

  const sidebarBadge = document.getElementById('sidebar-pending-req-badge');
  if (sidebarBadge) {
    sidebarBadge.textContent = pendingCount;
    if (pendingCount > 0) {
      sidebarBadge.classList.remove('hidden');
    } else {
      sidebarBadge.classList.add('hidden');
    }
  }

  const searchBadge = document.getElementById('search-bar-pending-badge');
  if (searchBadge) {
    searchBadge.textContent = pendingCount;
    if (pendingCount > 0) {
      searchBadge.classList.remove('hidden');
    } else {
      searchBadge.classList.add('hidden');
    }
  }

  const tabBadge = document.getElementById('admin-tab-pending-badge');
  if (tabBadge) {
    tabBadge.textContent = pendingCount;
  }
}

function syncAdminDirectStaffName() {
  const offSelect = document.getElementById('admin-direct-office-select');
  const staffInput = document.getElementById('admin-direct-staff-input');
  if (!offSelect || !staffInput) return;
  const staff = getOfficeStaff(offSelect.value);
  staffInput.value = staff ? staff.name : 'Branch Staff';
}

function syncAskStaffName() {
  const askOfficeSelect = document.getElementById('ask-office-select');
  const askStaffInput = document.getElementById('ask-staff-input');
  if (!askOfficeSelect || !askStaffInput) return;

  const officeId = askOfficeSelect.value;
  const staff = getOfficeStaff(officeId);
  askStaffInput.value = staff ? staff.name : '';
}

function openAskModalForOffice(officeId) {
  selectedOfficeId = officeId;
  const select = document.getElementById('ask-office-select');
  if (select) select.value = officeId;
  syncAskStaffName();
  openStaffAskModal();
}

function renderAskPanel() {
  updatePendingBadges();

  // 1. Staff Modal Recent Requests Preview
  const staffModalList = document.getElementById('staff-modal-requests-list');
  if (staffModalList) {
    const staff = (state.currentUser && state.currentUser.role === 'Staff')
      ? (state.staff.find(s => s.id === state.currentUser.staffId) || state.currentUser)
      : null;
    const office = staff ? (state.offices.find(o => o.id === staff.officeId) || state.offices[0]) : null;
    const myReqs = (state.askRequests || []).filter(r => r.officeId === office?.id || (staff && staff.name && r.staffName === staff.name)).slice(0, 3);

    if (myReqs.length === 0) {
      staffModalList.innerHTML = `<p class="text-xs text-slate-400 italic py-2">No previous requests made yet.</p>`;
    } else {
      staffModalList.innerHTML = myReqs.map(r => {
        const isSent = r.status === 'Sent by Admin' || r.status === 'Fulfilled';
        return `
          <div class="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <div>
              <div class="font-bold text-slate-800 dark:text-slate-200">
                ${(r.items || []).map(it => {
                  const c = state.components.find(x => x.id === it.componentId);
                  return `${it.countNeeded || it.count}x ${escapeHtml(it.componentName || (c ? c.name : 'Component'))}`;
                }).join(', ')}
              </div>
              <div class="text-[10px] text-slate-400">
                ${new Date(r.date).toLocaleDateString()}
              </div>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
              isSent ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            }">
              ${isSent ? '✓ Sent by Admin' : '⏳ Waiting for Admin'}
            </span>
          </div>
        `;
      }).join('');
    }
  }

  // 2. Admin Pending Requests Container (Waiting for Admin to Send)
  const pendingContainer = document.getElementById('pending-asks-container');
  if (pendingContainer) {
    const pendingList = (state.askRequests || []).filter(r => r.status === 'Pending');

    if (pendingList.length === 0) {
      pendingContainer.innerHTML = `
        <div class="text-center py-10 text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6">
          <i data-lucide="check-circle-2" class="w-10 h-10 mx-auto mb-2 text-emerald-500 opacity-70"></i>
          <p class="font-bold text-slate-700 dark:text-slate-200 text-sm">All Staff Requests Sent & Fulfilled!</p>
          <p class="text-slate-400 mt-1 max-w-sm mx-auto">When branch staff ask for components from their portal, requests will appear here for Admin to review and send.</p>
        </div>
      `;
    } else {
      pendingContainer.innerHTML = pendingList.map(req => {
        const office = state.offices.find(o => o.id === req.officeId);
        return `
          <div class="p-4 bg-white dark:bg-slate-900 rounded-2xl border-2 border-amber-300 dark:border-amber-700/60 shadow-sm space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2">
                  <span class="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 animate-pulse">
                    <i data-lucide="clock" class="w-3 h-3 text-amber-600"></i>
                    WAITING FOR ADMIN TO SEND
                  </span>
                  <span class="text-xs font-bold text-slate-900 dark:text-white">
                    ${escapeHtml(office ? office.name : 'Unknown Branch')}
                    ${office ? `<span class="text-blue-600 font-mono">(Pin #${office.number})</span>` : ''}
                  </span>
                </div>
                <p class="text-[11px] text-slate-500 mt-1">
                  Requested by Staff: <strong class="text-slate-800 dark:text-slate-200">${escapeHtml(req.staffName)}</strong> &bull; Date: ${new Date(req.date).toLocaleString()}
                </p>
              </div>

              <!-- Main Admin Action: Send Component -->
              <div class="flex items-center gap-2 flex-shrink-0">
                <button 
                  type="button"
                  onclick="adminSendComponent('${req.id}')" 
                  class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition cursor-pointer"
                  title="Approve and send requested components to this branch office"
                >
                  <i data-lucide="package-check" class="w-4 h-4"></i>
                  <span>Send Component to Branch</span>
                </button>
                <button 
                  type="button"
                  onclick="adminDeclineRequest('${req.id}')" 
                  class="px-2.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition cursor-pointer"
                  title="Decline this request"
                >
                  Decline
                </button>
              </div>
            </div>

            <!-- List of Asked Components ("make like list") -->
            <div class="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
              <span class="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Components Asked:</span>
              ${(req.items || []).map(it => {
                const comp = state.components.find(c => c.id === it.componentId);
                const name = it.componentName || it.name || (comp ? comp.name : 'Component');
                const number = it.componentNumber || it.number || (comp ? comp.code : 'CODE');
                const count = it.countNeeded || it.count || 1;
                const reason = it.reason || req.note || '';
                const img = it.image || (comp ? comp.image : DEFAULT_COMP_IMG);

                return `
                  <div class="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60 gap-3 text-xs">
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="w-10 h-10 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 border border-slate-300 dark:border-slate-600">
                        <img src="${img}" class="w-full h-full object-cover">
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="font-extrabold text-slate-900 dark:text-white">${escapeHtml(name)}</span>
                          <span class="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200/60">${escapeHtml(number)}</span>
                        </div>
                        ${reason ? `<div class="text-[11px] text-slate-500 italic mt-0.5">Reason: "${escapeHtml(reason)}"</div>` : ''}
                      </div>
                    </div>
                    <div class="text-right flex-shrink-0">
                      <span class="font-black text-sm text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 block">
                        Qty: ${count}
                      </span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            ${req.note ? `
              <div class="p-2 bg-slate-50 dark:bg-slate-800/40 rounded-lg text-[11px] text-slate-600 dark:text-slate-300">
                <strong>Summary Note:</strong> "${escapeHtml(req.note)}"
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }
  }

  // 3. Admin Dispatched / Sent History Container
  const dispatchedContainer = document.getElementById('admin-dispatched-history-container');
  if (dispatchedContainer) {
    const sentList = (state.askRequests || []).filter(r => r.status === 'Sent by Admin' || r.status === 'Fulfilled');
    if (sentList.length === 0) {
      dispatchedContainer.innerHTML = `
        <div class="text-center py-8 text-slate-400 text-xs">
          No sent records yet. When you click "Send Component", dispatched records will appear here.
        </div>
      `;
    } else {
      dispatchedContainer.innerHTML = sentList.map(req => {
        const office = state.offices.find(o => o.id === req.officeId);
        return `
          <div class="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <div>
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  <i data-lucide="check-circle" class="w-3 h-3 text-emerald-600"></i>
                  SENT BY ADMIN
                </span>
                <span class="font-bold text-slate-900 dark:text-white">
                  ${escapeHtml(office ? office.name : 'Office')} ${office ? `(Pin #${office.number})` : ''}
                </span>
              </div>
              <p class="text-[11px] text-slate-500 mt-0.5">
                Staff: ${escapeHtml(req.staffName)} &bull; ${req.sentDate ? new Date(req.sentDate).toLocaleString() : new Date(req.date).toLocaleDateString()}
              </p>
              <div class="mt-1 flex flex-wrap gap-1">
                ${(req.items || []).map(it => {
                  const comp = state.components.find(c => c.id === it.componentId);
                  const name = it.componentName || (comp ? comp.name : 'Part');
                  return `<span class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-700 dark:text-slate-300">${it.countNeeded || it.count}x ${escapeHtml(name)}</span>`;
                }).join(' ')}
              </div>
            </div>
            <div class="text-right text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
              ✓ Dispatched
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 4. Admin Direct Send Office Select and Component Picker
  const directOfficeSelect = document.getElementById('admin-direct-office-select');
  if (directOfficeSelect) {
    if (state.offices.length === 0) {
      directOfficeSelect.innerHTML = `<option value="">No offices created yet</option>`;
    } else {
      directOfficeSelect.innerHTML = state.offices.map(o => 
        `<option value="${o.id}">Pin #${o.number}: ${escapeHtml(o.name)}</option>`
      ).join('');
      syncAdminDirectStaffName();
    }
  }

  const directCompPicker = document.getElementById('admin-direct-component-picker');
  if (directCompPicker) {
    if (state.components.length === 0) {
      directCompPicker.innerHTML = `<p class="text-xs text-slate-400 py-2">No components in catalog</p>`;
    } else {
      directCompPicker.innerHTML = state.components.map(comp => `
        <div class="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
          <div class="flex items-center gap-2">
            <img src="${comp.image}" class="w-7 h-7 rounded object-cover">
            <div>
              <span class="font-bold text-slate-800 dark:text-slate-100 block">${escapeHtml(comp.name)}</span>
              <span class="text-[10px] text-slate-400 font-mono">${escapeHtml(comp.code)}</span>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button type="button" onclick="adjustCount('admin-direct-qty-${comp.id}', -1)" class="w-6 h-6 flex items-center justify-center rounded bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer">-</button>
            <input type="number" min="0" value="0" id="admin-direct-qty-${comp.id}" data-component-id="${comp.id}" class="admin-direct-count-field w-14 p-1 text-center font-bold text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900">
            <button type="button" onclick="adjustCount('admin-direct-qty-${comp.id}', 1)" class="w-6 h-6 flex items-center justify-center rounded bg-purple-100 dark:bg-purple-950 text-purple-700 font-bold cursor-pointer">+</button>
          </div>
        </div>
      `).join('');
    }
  }

  if (window.lucide) lucide.createIcons();
}

function adminSendComponent(requestId) {
  const req = state.askRequests.find(r => r.id === requestId);
  if (!req) return;

  const office = state.offices.find(o => o.id === req.officeId);
  const officeName = office ? office.name : 'Branch Office';

  const itemSummary = req.items.map(it => {
    const name = it.componentName || it.name || 'Component';
    const count = it.countNeeded || it.count || 1;
    return `${count}x ${name}`;
  }).join(', ');

  if (!confirm(`Send components to ${officeName} for ${req.staffName}?\n\nComponents: ${itemSummary}\n\nThis will credit the component stock at ${officeName}.`)) {
    return;
  }

  // 1. For each item in the request, add or locate in catalog and increment stock
  req.items.forEach(it => {
    const compName = it.componentName || it.name || 'Component';
    const compNumber = it.componentNumber || it.number || ('CMP-' + Math.floor(100 + Math.random() * 900));
    const count = parseInt(it.countNeeded || it.count, 10) || 1;
    const img = it.image || DEFAULT_COMP_IMG;

    let comp = state.components.find(c => 
      (it.componentId && c.id === it.componentId) ||
      (c.code && c.code.toLowerCase() === compNumber.toLowerCase()) ||
      (c.name && c.name.toLowerCase() === compName.toLowerCase())
    );

    if (!comp) {
      comp = {
        id: 'cmp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        code: compNumber,
        name: compName,
        category: 'General',
        unit: 'units',
        minStock: 5,
        image: img,
        description: it.reason || 'Added from staff requisition'
      };
      state.components.push(comp);
    }

    it.componentId = comp.id;

    // Increment stock in target branch office
    const currentStock = getStock(comp.id, req.officeId);
    setStock(comp.id, req.officeId, currentStock + count);

    // Record history log
    state.history.unshift({
      id: 'send-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      date: new Date().toISOString(),
      type: 'SENT_BY_ADMIN',
      fromOfficeId: 'admin',
      toOfficeId: req.officeId,
      componentId: comp.id,
      componentName: comp.name,
      componentNumber: comp.code,
      count: count,
      staffName: req.staffName,
      note: `Admin sent ${count}x ${comp.name} (${comp.code}) to ${officeName} (Reason: "${it.reason || 'Branch requisition'}")`
    });
  });

  // 2. Mark request as sent
  req.status = 'Sent by Admin';
  req.sentDate = new Date().toISOString();

  // 3. Save and re-render all views
  saveData();
  renderApp();
  renderAskPanel();
  showToast(`✓ Admin successfully sent ${itemSummary} to ${officeName}!`, 'success');
}

function fulfillAskRequest(requestId) {
  adminSendComponent(requestId);
}

function adminDeclineRequest(requestId) {
  const req = state.askRequests.find(r => r.id === requestId);
  if (!req) return;

  const reason = prompt('Reason for declining this request (optional):', 'Out of stock at central warehouse');
  if (reason === null) return; // user cancelled

  req.status = 'Declined';
  req.declineReason = reason;
  req.declineDate = new Date().toISOString();

  saveData();
  renderApp();
  renderAskPanel();
  showToast(`Request from ${req.staffName} declined.`, 'info');
}

function handleAdminDirectSendSubmit(e) {
  e.preventDefault();
  const officeId = document.getElementById('admin-direct-office-select')?.value;
  const note = document.getElementById('admin-direct-note-input')?.value.trim();

  if (!officeId) {
    alert('Please select a destination office.');
    return;
  }

  const office = state.offices.find(o => o.id === officeId);
  const items = [];
  document.querySelectorAll('.admin-direct-count-field').forEach(input => {
    const count = parseInt(input.value, 10) || 0;
    if (count > 0) {
      items.push({
        componentId: input.dataset.componentId,
        count: count
      });
    }
  });

  if (items.length === 0) {
    alert('Please enter a quantity greater than 0 for at least one component to send.');
    return;
  }

  items.forEach(it => {
    const comp = state.components.find(c => c.id === it.componentId);
    const current = getStock(it.componentId, officeId);
    setStock(it.componentId, officeId, current + it.count);

    state.history.unshift({
      id: 'send-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      date: new Date().toISOString(),
      type: 'SENT_BY_ADMIN',
      fromOfficeId: 'admin',
      toOfficeId: officeId,
      componentId: it.componentId,
      componentName: comp ? comp.name : 'Component',
      componentNumber: comp ? comp.code : 'CODE',
      count: it.count,
      staffName: office ? (getOfficeStaff(officeId)?.name || 'Admin Dispatch') : 'Admin Dispatch',
      note: `Direct dispatch by Admin: ${note || 'Stock replenishment'}`
    });
  });

  state.askRequests.unshift({
    id: 'ask-' + Date.now(),
    date: new Date().toISOString(),
    sentDate: new Date().toISOString(),
    officeId: officeId,
    staffName: office ? (getOfficeStaff(officeId)?.name || 'Admin Dispatch') : 'Admin Dispatch',
    status: 'Sent by Admin',
    items: items,
    note: note || 'Direct dispatch from Admin'
  });

  saveData();
  renderApp();
  renderAskPanel();
  showToast(`✓ Admin sent components to ${office ? office.name : 'office'}!`, 'success');
  switchAdminAskTab('history');
}

window.staffAddCompToList = staffAddCompToList;
window.staffRemoveCompFromList = staffRemoveCompFromList;
window.staffClearAskList = staffClearAskList;
window.staffSubmitAskListToAdmin = staffSubmitAskListToAdmin;

// MOVING
function openQuickMoveModal(componentId, fromOfficeId) {
  const compSelect = document.getElementById('move-component-select');
  const fromSelect = document.getElementById('move-from-select');
  const toSelect = document.getElementById('move-to-select');

  if (compSelect) {
    compSelect.innerHTML = state.components.map(c => 
      `<option value="${c.id}" ${c.id === componentId ? 'selected' : ''}>${escapeHtml(c.code)} - ${escapeHtml(c.name)}</option>`
    ).join('');
  }

  if (fromSelect && toSelect) {
    const options = state.offices.map(o => 
      `<option value="${o.id}">Pin #${o.number}: ${escapeHtml(o.name)}</option>`
    ).join('');

    fromSelect.innerHTML = options;
    toSelect.innerHTML = options;

    fromSelect.value = fromOfficeId;
    const other = state.offices.find(o => o.id !== fromOfficeId);
    if (other) toSelect.value = other.id;

    updateMoveAvailableInfo();
  }

  openModal('modal-moving');
}

function updateMoveAvailableInfo() {
  const compId = document.getElementById('move-component-select').value;
  const fromId = document.getElementById('move-from-select').value;
  const label = document.getElementById('move-available-label');

  if (compId && fromId && label) {
    const avail = getStock(compId, fromId);
    const comp = state.components.find(c => c.id === compId);
    label.textContent = `Available at Source Office: ${avail} ${comp ? comp.unit : 'pcs'}`;
  }
}

function handleMoveSubmit(e) {
  e.preventDefault();
  const componentId = document.getElementById('move-component-select').value;
  const fromOfficeId = document.getElementById('move-from-select').value;
  const toOfficeId = document.getElementById('move-to-select').value;
  const count = parseInt(document.getElementById('move-count-input').value, 10);
  const note = document.getElementById('move-note-input').value.trim();

  if (!componentId || !fromOfficeId || !toOfficeId || !count || count <= 0) {
    alert('Please enter valid movement fields.');
    return;
  }

  if (fromOfficeId === toOfficeId) {
    alert('Source office and Destination office must be different!');
    return;
  }

  const avail = getStock(componentId, fromOfficeId);
  if (count > avail) {
    alert(`Insufficient stock! Source office only has ${avail} units.`);
    return;
  }

  setStock(componentId, fromOfficeId, avail - count);
  const destCurrent = getStock(componentId, toOfficeId);
  setStock(componentId, toOfficeId, destCurrent + count);

  const staff = getOfficeStaff(fromOfficeId);

  state.history.unshift({
    id: 'mov-' + Date.now(),
    date: new Date().toISOString(),
    type: 'MOVING',
    fromOfficeId: fromOfficeId,
    toOfficeId: toOfficeId,
    componentId: componentId,
    count: count,
    staffName: staff ? staff.name : (state.currentUser ? state.currentUser.name : 'Admin'),
    note: note || 'Inter-office stock movement'
  });

  saveData();
  closeModal('modal-moving');
  renderApp();
  showToast(`Successfully moved ${count} units!`, 'success');
}

// RECEIVED
function handleReceivedSubmit(e) {
  e.preventDefault();
  const componentId = document.getElementById('received-component-select').value;
  const officeId = document.getElementById('received-office-select').value;
  const count = parseInt(document.getElementById('received-count-input').value, 10);
  const note = document.getElementById('received-note-input').value.trim();

  if (!componentId || !officeId || !count || count <= 0) {
    alert('Please specify a component, destination office, and positive count.');
    return;
  }

  const current = getStock(componentId, officeId);
  setStock(componentId, officeId, current + count);

  state.history.unshift({
    id: 'mov-' + Date.now(),
    date: new Date().toISOString(),
    type: 'RECEIVED',
    fromOfficeId: null,
    toOfficeId: officeId,
    componentId: componentId,
    count: count,
    staffName: state.currentUser ? state.currentUser.name : 'Admin',
    note: note || 'New inventory received'
  });

  saveData();
  closeModal('modal-received');
  renderApp();
  showToast(`Received ${count} units into office!`, 'success');
}

// HISTORY
function renderHistoryView() {
  const container = document.getElementById('history-table-body');
  if (!container) return;

  if (state.history.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-8 text-slate-400">
          No stock movements recorded yet.
        </td>
      </tr>
    `;
    return;
  }

  container.innerHTML = state.history.map(item => {
    const comp = state.components.find(c => c.id === item.componentId);
    const fromOff = state.offices.find(o => o.id === item.fromOfficeId);
    const toOff = state.offices.find(o => o.id === item.toOfficeId);

    const isMoving = item.type === 'MOVING';
    const isSentByAdmin = item.type === 'SENT_BY_ADMIN';
    let typeBadge = '';
    if (isSentByAdmin) {
      typeBadge = '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">SENT BY ADMIN</span>';
    } else if (isMoving) {
      typeBadge = '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">MOVING</span>';
    } else {
      typeBadge = '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">RECEIVED</span>';
    }

    let fromText = 'Supplier / External';
    if (isSentByAdmin) {
      fromText = '<strong class="text-purple-600 dark:text-purple-400">Admin (Central)</strong>';
    } else if (fromOff) {
      fromText = `Pin #${fromOff.number} (${fromOff.city || fromOff.name})`;
    }
    const toText = toOff ? `<strong class="text-slate-900 dark:text-white">Pin #${toOff.number} (${toOff.city || toOff.name})</strong>` : 'External';

    return `
      <tr class="border-b border-slate-200 dark:border-slate-800 text-xs">
        <td class="py-2.5 px-3 font-mono text-slate-400">${new Date(item.date).toLocaleDateString()}</td>
        <td class="py-2.5 px-3">${typeBadge}</td>
        <td class="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-100">
          <div class="flex items-center gap-2">
            ${comp ? `<img src="${comp.image}" class="w-6 h-6 rounded object-cover flex-shrink-0">` : ''}
            <span>${escapeHtml(comp ? comp.name : 'Unknown Component')}</span>
          </div>
        </td>
        <td class="py-2.5 px-3 text-slate-600 dark:text-slate-300">
          ${fromText} &rarr; ${toText}
        </td>
        <td class="py-2.5 px-3 text-center font-black text-blue-600 dark:text-blue-400">${item.count}</td>
        <td class="py-2.5 px-3 text-slate-500">${escapeHtml(item.staffName || 'Admin')}</td>
      </tr>
    `;
  }).join('');
}

// --------------------------------------------------------
// ADMIN DATA CREATION SUITE ("NEW")
// --------------------------------------------------------

function switchNewTab(tabName) {
  document.querySelectorAll('.new-tab-btn').forEach(btn => {
    if (btn.dataset.newtab === tabName) {
      btn.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
      btn.classList.remove('bg-slate-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
    } else {
      btn.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
      btn.classList.add('bg-slate-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-300');
    }
  });

  const tabContents = ['comp', 'office', 'staff', 'stock', 'bulk', 'mongo'];
  tabContents.forEach(t => {
    const el = document.getElementById(`new-tab-content-${t}`);
    if (el) {
      if (t === tabName) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });

  renderNewModalDynamicFields();
  if (window.lucide) lucide.createIcons();
}

function renderNewModalDynamicFields() {
  const compStockContainer = document.getElementById('new-comp-stock-matrix');
  if (compStockContainer) {
    if (state.offices.length === 0) {
      compStockContainer.innerHTML = `
        <div class="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300">
          <strong>Tip:</strong> No branch offices created yet. You can add this component first, or switch to the <em>"Office / Map Pin"</em> tab to create your branches.
        </div>
      `;
    } else {
      compStockContainer.innerHTML = state.offices.map(o => `
        <div class="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200/70 dark:border-slate-700/60">
          <span class="font-semibold text-slate-700 dark:text-slate-200">
            Pin #${o.number}: ${escapeHtml(o.name)} (${escapeHtml(o.city)})
          </span>
          <div class="flex items-center gap-1">
            <input 
              type="number" 
              min="0" 
              value="0" 
              id="init-stock-off-${o.id}" 
              data-office-id="${o.id}"
              class="init-stock-field w-20 p-1 text-center font-bold text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900"
            >
            <span class="text-[10px] text-slate-400">units</span>
          </div>
        </div>
      `).join('');
    }
  }

  const offStaffSelect = document.getElementById('new-off-staff-select');
  if (offStaffSelect) {
    offStaffSelect.innerHTML = `
      <option value="new">+ Create New Staff Member Below</option>
      ${state.staff.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${escapeHtml(s.role)})</option>`).join('')}
    `;
  }

  const staffOffSelect = document.getElementById('new-staff-office-select');
  if (staffOffSelect) {
    if (state.offices.length === 0) {
      staffOffSelect.innerHTML = `<option value="">No offices created yet (Create office first)</option>`;
    } else {
      staffOffSelect.innerHTML = state.offices.map(o => 
        `<option value="${o.id}">Pin #${o.number}: ${escapeHtml(o.name)}</option>`
      ).join('');
    }
  }

  const stockOffSelect = document.getElementById('quick-stock-office-select');
  const stockCompSelect = document.getElementById('quick-stock-comp-select');

  if (stockOffSelect) {
    if (state.offices.length === 0) {
      stockOffSelect.innerHTML = `<option value="">No offices created yet</option>`;
    } else {
      stockOffSelect.innerHTML = state.offices.map(o => 
        `<option value="${o.id}">Pin #${o.number}: ${escapeHtml(o.name)}</option>`
      ).join('');
    }
  }

  if (stockCompSelect) {
    if (state.components.length === 0) {
      stockCompSelect.innerHTML = `<option value="">No components created yet</option>`;
    } else {
      stockCompSelect.innerHTML = state.components.map(c => 
        `<option value="${c.id}">${escapeHtml(c.code)} - ${escapeHtml(c.name)}</option>`
      ).join('');
    }
  }

  syncQuickStockCurrent();

  const recComp = document.getElementById('received-component-select');
  const recOff = document.getElementById('received-office-select');
  if (recComp) {
    if (state.components.length === 0) {
      recComp.innerHTML = `<option value="">No components created yet</option>`;
    } else {
      recComp.innerHTML = state.components.map(c => 
        `<option value="${c.id}">${escapeHtml(c.code)} - ${escapeHtml(c.name)}</option>`
      ).join('');
    }
  }
  if (recOff) {
    if (state.offices.length === 0) {
      recOff.innerHTML = `<option value="">No offices created yet</option>`;
    } else {
      recOff.innerHTML = state.offices.map(o => 
        `<option value="${o.id}">Pin #${o.number}: ${escapeHtml(o.name)}</option>`
      ).join('');
    }
  }
}

function syncQuickStockCurrent() {
  const stockOffSelect = document.getElementById('quick-stock-office-select');
  const stockCompSelect = document.getElementById('quick-stock-comp-select');
  const currentLabel = document.getElementById('quick-stock-current-label');
  const countInput = document.getElementById('quick-stock-count-input');

  if (stockOffSelect && stockCompSelect && currentLabel) {
    const oId = stockOffSelect.value;
    const cId = stockCompSelect.value;
    if (!oId || !cId) {
      currentLabel.textContent = `Current Stock in this Office: 0 pcs`;
      if (countInput) countInput.value = 0;
      return;
    }
    const curr = getStock(cId, oId);
    const comp = state.components.find(c => c.id === cId);
    currentLabel.textContent = `Current Stock in this Office: ${curr} ${comp ? comp.unit : 'pcs'}`;
    if (countInput) countInput.value = curr;
  }
}

function applyCityPreset(cityName, lat, lng, defaultState = 'Tamil Nadu') {
  document.getElementById('new-off-name').value = `${cityName} Innovation Hub`;
  document.getElementById('new-off-city').value = cityName;
  document.getElementById('new-off-state').value = defaultState;
  document.getElementById('new-off-lat').value = lat;
  document.getElementById('new-off-lng').value = lng;
  showToast(`Auto-filled coordinates for ${cityName}!`, 'info');
}

function handleNewComponentSubmit(e) {
  e.preventDefault();
  const code = document.getElementById('new-comp-code').value.trim();
  const name = document.getElementById('new-comp-name').value.trim();
  const category = document.getElementById('new-comp-cat').value.trim() || 'General';
  const unit = document.getElementById('new-comp-unit').value.trim() || 'pcs';
  const minStock = parseInt(document.getElementById('new-comp-min').value, 10) || 10;
  const image = document.getElementById('new-comp-img').value.trim() || 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=200&auto=format&fit=crop&q=80';
  const description = document.getElementById('new-comp-desc').value.trim();

  if (!code || !name) {
    alert('Component Code and Name are required!');
    return;
  }

  const newComp = {
    id: 'cmp-' + Date.now(),
    code,
    name,
    category,
    unit,
    minStock,
    image,
    description
  };

  state.components.push(newComp);

  document.querySelectorAll('.init-stock-field').forEach(input => {
    const oId = input.dataset.officeId;
    const count = parseInt(input.value, 10) || 0;
    setStock(newComp.id, oId, count);
  });

  saveData();
  document.getElementById('new-comp-form').reset();
  document.getElementById('new-comp-img-preview-container')?.classList.add('hidden');
  closeModal('modal-new');
  renderApp();
  renderSketchMap();
  showToast(`Added component "${name}" with initial stock!`, 'success');
}

// High-Precision Google Location Link & GPS Parser Engine
function parseDms(text) {
  if (!text) return null;
  const pattern = /(\d{1,3})[°\s:d]+(\d{1,2})['\s:m]+([\d.]+)[\\"s\s]*([NSEW])/gi;
  const matches = [...text.matchAll(pattern)];
  if (matches.length >= 2) {
    const coords = matches.slice(0, 2).map(m => {
      const deg = parseFloat(m[1]);
      const min = parseFloat(m[2]);
      const sec = parseFloat(m[3]);
      const dir = m[4].toUpperCase();
      let dd = deg + (min / 60.0) + (sec / 3600.0);
      if (dir === 'S' || dir === 'W') dd = -dd;
      return dd;
    });
    if (isValidLatLng(coords[0], coords[1])) {
      return { lat: coords[0], lng: coords[1] };
    }
  }
  return null;
}

function isValidLatLng(lat, lng) {
  return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function extractCoordinatesFromGoogleUrl(url) {
  if (!url) return null;
  const raw = String(url).trim();
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch (e) {}

  // 1. Direct decimal coordinates e.g. "13.0827, 80.2707"
  const directMatch = raw.match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (directMatch) {
    const lat = parseFloat(directMatch[1]);
    const lng = parseFloat(directMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // 2. DMS coordinates (e.g. 13°04'57.7"N 80°16'14.6"E)
  const dms = parseDms(decoded) || parseDms(raw);
  if (dms) {
    return { lat: dms.lat, lng: dms.lng };
  }

  // 3. Exact pinpoint !3d<lat>!4d<lng> or !4d<lng>!3d<lat> (Place Marker Pin)
  const m3d = raw.match(/!3d(-?\d{1,3}(?:\.\d+)?)/);
  const m4d = raw.match(/!4d(-?\d{1,3}(?:\.\d+)?)/);
  if (m3d && m4d) {
    const lat = parseFloat(m3d[1]);
    const lng = parseFloat(m4d[1]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // 4. Query / center / ll / destination / daddr / saddr parameters
  const queryMatch = raw.match(/[?&](?:q|query|ll|center|destination|daddr|saddr)=(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i);
  if (queryMatch) {
    const lat = parseFloat(queryMatch[1]);
    const lng = parseFloat(queryMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // 5. /place/<lat>,<lng>
  const placeCoordMatch = raw.match(/\/place\/(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i);
  if (placeCoordMatch) {
    const lat = parseFloat(placeCoordMatch[1]);
    const lng = parseFloat(placeCoordMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // 6. Camera Viewport @lat,lng e.g. /@13.0826802,80.2707184,15z/
  const atMatch = raw.match(/@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  return null;
}

function extractPlaceNameFromGoogleUrl(url) {
  if (!url) return null;
  let decoded = String(url).trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch (e) {}

  // Check /maps/place/<name>/ or /maps/search/<name>/
  const mPlace = decoded.match(/\/maps\/(?:place|search)\/([^/@?#]+)/i);
  if (mPlace) {
    const name = mPlace[1].replace(/\+/g, ' ').trim();
    if (name && !name.match(/^-?\d{1,3}\.\d+/) && !name.includes('°')) {
      return name;
    }
  }

  // Check ?q=<name>
  const mQuery = decoded.match(/[?&](?:q|query)=([^&]+)/i);
  if (mQuery) {
    const q = mQuery[1].replace(/\+/g, ' ').trim();
    if (q && !q.match(/^-?\d{1,3}\.\d+/) && !q.includes('°')) {
      return q;
    }
  }

  return null;
}

function extractCoordinatesFromHtml(html) {
  if (!html) return null;
  const m3d = html.match(/!3d(-?\d{1,3}(?:\.\d+)?)/);
  const m4d = html.match(/!4d(-?\d{1,3}(?:\.\d+)?)/);
  if (m3d && m4d) {
    const lat = parseFloat(m3d[1]);
    const lng = parseFloat(m4d[1]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }
  const mCenter = html.match(/center=(-?\d{1,3}\.\d+)(?:%2C|,)(-?\d{1,3}\.\d+)/i);
  if (mCenter) {
    const lat = parseFloat(mCenter[1]);
    const lng = parseFloat(mCenter[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }
  const mAt = html.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (mAt) {
    const lat = parseFloat(mAt[1]);
    const lng = parseFloat(mAt[2]);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }
  return null;
}

async function resolveShortGoogleMapsUrl(shortUrl) {
  if (!shortUrl) return null;
  const cleanUrl = shortUrl.trim();

  // Try 1: allorigins.win
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
    const resp = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(cleanUrl)}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.status && data.status.url) {
        const coords = extractCoordinatesFromGoogleUrl(data.status.url);
        if (coords) return coords;
      }
      if (data && data.contents) {
        const coordsFromHtml = extractCoordinatesFromHtml(data.contents);
        if (coordsFromHtml) return coordsFromHtml;
        const placeFromHtml = extractPlaceNameFromGoogleUrl(data.status?.url || '');
        if (placeFromHtml) return { address: placeFromHtml };
      }
    }
  } catch (err) {
    console.warn('allorigins resolution failed:', err);
  }

  // Try 2: unshorten.me
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const resp = await fetch(`https://unshorten.me/json/${encodeURIComponent(cleanUrl)}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.unshortened_url) {
        const coords = extractCoordinatesFromGoogleUrl(data.unshortened_url);
        if (coords) return coords;
        const place = extractPlaceNameFromGoogleUrl(data.unshortened_url);
        if (place) return { address: place };
      }
    }
  } catch (err) {
    console.warn('unshorten.me resolution failed:', err);
  }

  // Try 3: corsproxy.io
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const resp = await fetch(`https://corsproxy.io/?${encodeURIComponent(cleanUrl)}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (resp.ok && resp.url) {
      const coords = extractCoordinatesFromGoogleUrl(resp.url);
      if (coords) return coords;
    }
  } catch (err) {
    console.warn('corsproxy resolution failed:', err);
  }

  return null;
}

function geocodeAddressPromise(address) {
  return new Promise((resolve) => {
    if (typeof google === 'undefined' || !google.maps || !google.maps.Geocoder) {
      return resolve(null);
    }
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address }, (results, status) => {
      if (status === 'OK' && results && results[0] && results[0].geometry && results[0].geometry.location) {
        const loc = results[0].geometry.location;
        resolve({ lat: loc.lat(), lng: loc.lng() });
      } else {
        resolve(null);
      }
    });
  });
}

async function resolveGoogleLocation(locationLink, branchName) {
  if (!locationLink) return null;

  // Step 1: Direct extraction (works for all full Google Maps URLs, DMS, coordinates, !3d!4d, @lat,lng)
  const direct = extractCoordinatesFromGoogleUrl(locationLink);
  if (direct && isValidLatLng(direct.lat, direct.lng)) {
    return direct;
  }

  // Step 2: If short URL, resolve via unshorteners
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(locationLink)) {
    const resolved = await resolveShortGoogleMapsUrl(locationLink);
    if (resolved) {
      if (isValidLatLng(resolved.lat, resolved.lng)) {
        return resolved;
      }
      if (resolved.address) {
        const geoFromAddr = await geocodeAddressPromise(resolved.address);
        if (geoFromAddr) return geoFromAddr;
      }
    }
  }

  // Step 3: Check if place name / address was in the URL path (e.g. /place/Taj+Coromandel)
  const placeName = extractPlaceNameFromGoogleUrl(locationLink);
  if (placeName) {
    const geoFromPlace = await geocodeAddressPromise(placeName);
    if (geoFromPlace) return geoFromPlace;
  }

  // Step 4: Fall back to geocoding the branch name
  if (branchName) {
    const geoFromName = await geocodeAddressPromise(branchName);
    if (geoFromName) return geoFromName;
  }

  return null;
}

async function handleNewOfficeSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const nameInput = document.getElementById('new-off-name');
  const locationLinkInput = document.getElementById('new-off-location-link');
  const staffNameInput = document.getElementById('new-off-staff-name');
  const staffPhoneInput = document.getElementById('new-off-staff-phone');
  const staffEmailInput = document.getElementById('new-off-staff-email');

  const name = nameInput.value.trim();
  const locationLink = locationLinkInput.value.trim();
  const staffName = staffNameInput.value.trim();
  const staffPhone = staffPhoneInput.value.trim();
  const staffEmail = staffEmailInput.value.trim();

  if (!name) {
    alert('Please enter the Office / Branch Name.');
    nameInput.focus();
    return;
  }
  if (!locationLink) {
    alert('Please enter your Google Location Link.');
    locationLinkInput.focus();
    return;
  }
  if (!staffName || !staffPhone || !staffEmail) {
    alert('Please fill in Staff Name, Staff Number, and Email ID.');
    return;
  }

  const submitBtn = e.target ? e.target.querySelector('button[type="submit"]') : null;
  const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span class="inline-flex items-center gap-2"><span class="animate-spin">⏳</span> Pinpointing Exact Location...</span>`;
  }

  try {
    // Check if coordinates were already cached on input element
    let coords = null;
    if (locationLinkInput.dataset.detectedLat && locationLinkInput.dataset.detectedLng) {
      const dLat = parseFloat(locationLinkInput.dataset.detectedLat);
      const dLng = parseFloat(locationLinkInput.dataset.detectedLng);
      if (isValidLatLng(dLat, dLng)) {
        coords = { lat: dLat, lng: dLng };
      }
    }

    if (!coords) {
      coords = await resolveGoogleLocation(locationLink, name);
    }

    if (!coords || !isValidLatLng(coords.lat, coords.lng)) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
      alert(
        `Unable to pinpoint exact GPS location from this link.\n\n` +
        `Tips to get the exact location pin:\n` +
        `1. Open Google Maps in your browser and copy the full URL (e.g. https://www.google.com/maps/place/...)\n` +
        `2. Or right-click the location on Google Maps, click the coordinates to copy (e.g. 13.0827, 80.2707), and paste them into the Google Location Link field.`
      );
      return;
    }

    const officeId = 'off-' + Date.now();
    const staffId = 'stf-' + Date.now();
    const officeNumber = state.offices.length + 1;

    // Create Staff with login credentials
    const staffUsername = staffEmail ? staffEmail.split('@')[0] : staffName.toLowerCase().replace(/\s+/g, '');
    const newStaff = {
      id: staffId,
      name: staffName,
      username: staffUsername,
      role: 'Office In-Charge',
      phone: staffPhone,
      email: staffEmail,
      officeId: officeId,
      password: 'staff123'
    };
    state.staff.push(newStaff);

    // Create Office with verified exact coordinates
    const newOffice = {
      id: officeId,
      number: officeNumber,
      name: name,
      code: 'BR-' + String(officeNumber).padStart(2, '0'),
      googleMapsUrl: locationLink,
      lat: Number(coords.lat),
      lng: Number(coords.lng),
      city: name.split(' ')[0] || 'Branch',
      state: 'Regional',
      staffId: staffId,
      staffName: staffName,
      staffPhone: staffPhone,
      staffEmail: staffEmail
    };

    state.offices.push(newOffice);

    // Initialize component stock counts to 0
    state.components.forEach(c => {
      setStock(c.id, officeId, 0);
    });

    saveData();
    document.getElementById('new-off-form').reset();
    locationLinkInput.dataset.detectedLat = '';
    locationLinkInput.dataset.detectedLng = '';
    const statusSpan = document.getElementById('new-off-coords-preview');
    if (statusSpan) statusSpan.textContent = 'Paste Google Maps URL to auto-detect GPS pin';

    closeModal('modal-new');
    renderApp();
    renderGoogleMarkers();
    renderMapMarkers();
    renderSketchMap();
    selectOffice(officeId);
    showToast(`Saved "${name}"! Pin #${newOffice.number} plotted & Staff login activated (Pass: staff123).`, 'success');
  } catch (err) {
    console.error('Error saving office:', err);
    alert('An unexpected error occurred while saving the office. Please try again.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
  }
}

function handleNewStaffSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('new-staff-name').value.trim();
  const role = document.getElementById('new-staff-role').value.trim() || 'Staff In-Charge';
  const email = document.getElementById('new-staff-email').value.trim();
  const phone = document.getElementById('new-staff-phone').value.trim();
  const officeId = document.getElementById('new-staff-office-select').value;
  const password = document.getElementById('new-staff-password')?.value.trim() || 'staff123';

  if (!name) {
    alert('Staff Name is required!');
    return;
  }

  const staffId = 'stf-' + Date.now();
  const staffUsername = email ? email.split('@')[0] : name.toLowerCase().replace(/\s+/g, '');
  const newStaff = {
    id: staffId,
    name,
    username: staffUsername,
    role,
    email: email || `${name.toLowerCase().replace(/\s+/g, '.')}@aurora.com`,
    phone: phone || '+91 90000 00000',
    officeId: officeId,
    password: password
  };

  state.staff.push(newStaff);

  const targetOff = state.offices.find(o => o.id === officeId);
  if (targetOff) {
    targetOff.staffId = staffId;
  }

  saveData();
  document.getElementById('new-staff-form').reset();
  closeModal('modal-new');
  renderApp();
  showToast(`Added staff "${name}"! Login password: "${password}"`, 'success');
}

function handleQuickStockSubmit(e) {
  e.preventDefault();
  const oId = document.getElementById('quick-stock-office-select').value;
  const cId = document.getElementById('quick-stock-comp-select').value;
  const count = parseInt(document.getElementById('quick-stock-count-input').value, 10);
  const note = document.getElementById('quick-stock-note-input').value.trim();

  if (isNaN(count) || count < 0) {
    alert('Quantity must be 0 or higher!');
    return;
  }

  const old = getStock(cId, oId);
  setStock(cId, oId, count);

  state.history.unshift({
    id: 'mov-' + Date.now(),
    date: new Date().toISOString(),
    type: 'RECEIVED',
    fromOfficeId: null,
    toOfficeId: oId,
    componentId: cId,
    count: Math.abs(count - old),
    staffName: state.currentUser ? state.currentUser.name : 'Admin',
    note: `Direct count adjustment from ${old} to ${count}. ${note}`
  });

  saveData();
  closeModal('modal-new');
  renderApp();
  renderSketchMap();
  showToast(`Updated stock count to ${count} units!`, 'success');
}

// Bulk Data Management
function exportDataJSON() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const dl = document.createElement('a');
  dl.setAttribute("href", dataStr);
  dl.setAttribute("download", `aurora_loc_backup_${new Date().toISOString().slice(0, 10)}.json`);
  document.body.appendChild(dl);
  dl.click();
  dl.remove();
  showToast('Database exported to JSON file!', 'success');
}

function triggerImportJSON() {
  document.getElementById('import-file-input').click();
}

function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const imported = JSON.parse(event.target.result);
      if (imported.offices && imported.components && imported.stocks) {
        state = imported;
        saveData();
        renderApp();
        renderGoogleMarkers();
        renderMapMarkers();
        renderSketchMap();
        closeModal('modal-new');
        showToast('All database records restored successfully!', 'success');
      } else {
        alert('Invalid backup file structure.');
      }
    } catch (err) {
      alert('Error parsing JSON backup file: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function exportToCSV() {
  if (state.components.length === 0) {
    alert('No components to export.');
    return;
  }

  let headers = ['Component Code', 'Name', 'Category', 'Unit', 'Min Threshold'];
  state.offices.forEach(o => headers.push(`"Pin #${o.number} ${o.name} (${o.city})"`));
  headers.push('Total Units');

  let rows = [headers.join(',')];

  state.components.forEach(c => {
    let row = [
      `"${c.code}"`,
      `"${c.name.replace(/"/g, '""')}"`,
      `"${(c.category || '').replace(/"/g, '""')}"`,
      `"${c.unit || 'pcs'}"`,
      c.minStock
    ];

    let tot = 0;
    state.offices.forEach(o => {
      const q = getStock(c.id, o.id);
      tot += q;
      row.push(q);
    });

    row.push(tot);
    rows.push(row.join(','));
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `aurora_inventory_report_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast('Inventory report exported to CSV / Excel!', 'success');
}

function clearAllUserData() {
  if (confirm('Are you sure you want to clear all data? This will wipe all offices, components, staff, and history so you can start completely fresh with real data.')) {
    state = JSON.parse(JSON.stringify(INITIAL_DATA));
    selectedOfficeId = null;
    saveData();
    renderApp();
    renderGoogleMarkers();
    renderMapMarkers();
    renderSketchMap();
    closeModal('modal-new');
    showToast('Database wiped clean. Ready for new data entry!', 'info');
  }
}

function resetToDefaultData() {
  clearAllUserData();
}

window.clearAllUserData = clearAllUserData;
window.resetToDefaultData = resetToDefaultData;

// UI Views
function openView(viewName) {
  currentView = viewName;

  document.querySelectorAll('.sidebar-nav-btn').forEach(btn => {
    if (btn.dataset.view === viewName) {
      btn.classList.add('bg-blue-600', 'text-white', 'shadow-md');
      btn.classList.remove('text-slate-600', 'hover:bg-slate-100', 'dark:text-slate-300', 'dark:hover:bg-slate-800');
    } else {
      btn.classList.remove('bg-blue-600', 'text-white', 'shadow-md');
      btn.classList.add('text-slate-600', 'hover:bg-slate-100', 'dark:text-slate-300', 'dark:hover:bg-slate-800');
    }
  });

  if (viewName === 'ask') {
    if (state.currentUser && state.currentUser.role === 'Staff') {
      openStaffAskModal();
    } else {
      openAdminRequestsModal();
    }
  } else if (viewName === 'moving') {
    if (state.offices.length < 2) {
      alert('You need at least 2 branch offices created to move stock between locations. Please go to "New" -> "Office / Map Pin" first.');
      openView('new');
      switchNewTab('office');
      return;
    }
    if (state.components.length === 0) {
      alert('No components available in inventory to move. Please go to "New" -> "Component" first.');
      openView('new');
      switchNewTab('comp');
      return;
    }
    openQuickMoveModal(state.components[0]?.id, selectedOfficeId || state.offices[0]?.id);
  } else if (viewName === 'received') {
    if (state.offices.length === 0) {
      alert('No offices found! Please create a branch office in "New" before receiving stock.');
      openView('new');
      switchNewTab('office');
      return;
    }
    if (state.components.length === 0) {
      alert('No components found! Please create a component in "New" before receiving stock.');
      openView('new');
      switchNewTab('comp');
      return;
    }
    openModal('modal-received');
  } else if (viewName === 'history') {
    openModal('modal-history');
  } else if (viewName === 'new') {
    openModal('modal-new');
    switchNewTab('comp');
  }
}

function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) {
    m.classList.remove('hidden');
    m.classList.add('flex');
    if (window.lucide) lucide.createIcons();
  }
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) {
    m.classList.add('hidden');
    m.classList.remove('flex');
  }
}

// Event Listeners
function setupEventListeners() {
  document.getElementById('login-form')?.addEventListener('submit', handleLogin);
  document.getElementById('ask-form')?.addEventListener('submit', handleAskSubmit);

  const staffImgInput = document.getElementById('staff-text-comp-image-file');
  if (staffImgInput) {
    staffImgInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target.result;
          const dataInput = document.getElementById('staff-text-comp-image-data');
          const preview = document.getElementById('staff-text-img-preview');
          const previewWrap = document.getElementById('staff-text-img-preview-wrap');
          const label = document.getElementById('staff-text-img-label');
          if (dataInput) dataInput.value = base64;
          if (preview) preview.src = base64;
          if (previewWrap) previewWrap.classList.remove('hidden');
          if (label) label.textContent = 'Change Image';
        };
        reader.readAsDataURL(file);
      }
    });
  }
  document.getElementById('admin-direct-send-form')?.addEventListener('submit', handleAdminDirectSendSubmit);
  document.getElementById('move-form')?.addEventListener('submit', handleMoveSubmit);
  document.getElementById('received-form')?.addEventListener('submit', handleReceivedSubmit);
  
  document.getElementById('new-comp-form')?.addEventListener('submit', handleNewComponentSubmit);
  document.getElementById('new-off-form')?.addEventListener('submit', handleNewOfficeSubmit);
  document.getElementById('new-staff-form')?.addEventListener('submit', handleNewStaffSubmit);
  document.getElementById('quick-stock-form')?.addEventListener('submit', handleQuickStockSubmit);
  document.getElementById('import-file-input')?.addEventListener('change', handleFileImport);

  document.getElementById('ask-office-select')?.addEventListener('change', syncAskStaffName);
  document.getElementById('move-from-select')?.addEventListener('change', updateMoveAvailableInfo);
  document.getElementById('move-component-select')?.addEventListener('change', updateMoveAvailableInfo);
  document.getElementById('quick-stock-office-select')?.addEventListener('change', syncQuickStockCurrent);
  document.getElementById('quick-stock-comp-select')?.addEventListener('change', syncQuickStockCurrent);

  window.addEventListener('resize', () => {
    if (leafletMap) leafletMap.invalidateSize();
  });

  const compFileInput = document.getElementById('new-comp-file');
  if (compFileInput) {
    compFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target.result;
          document.getElementById('new-comp-img').value = base64;
          const preview = document.getElementById('new-comp-img-preview');
          const previewContainer = document.getElementById('new-comp-img-preview-container');
          if (preview && previewContainer) {
            preview.src = base64;
            previewContainer.classList.remove('hidden');
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Live Google Location Link Coordinate Detector
  const offLinkInput = document.getElementById('new-off-location-link');
  if (offLinkInput) {
    let resolveDebounceTimer = null;

    const handleLinkInput = async () => {
      const val = offLinkInput.value.trim();
      const statusSpan = document.getElementById('new-off-coords-preview');
      if (!val) {
        if (statusSpan) statusSpan.textContent = 'Paste Google Maps URL to auto-detect GPS pin';
        offLinkInput.dataset.detectedLat = '';
        offLinkInput.dataset.detectedLng = '';
        return;
      }

      // 1. Direct synchronous extraction (instant for full Google Maps links, DMS, coordinates, !3d!4d, @lat,lng)
      const directCoords = extractCoordinatesFromGoogleUrl(val);
      if (directCoords && isValidLatLng(directCoords.lat, directCoords.lng)) {
        offLinkInput.dataset.detectedLat = directCoords.lat;
        offLinkInput.dataset.detectedLng = directCoords.lng;
        if (statusSpan) {
          statusSpan.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400 font-bold">✓ Exact GPS Pinpoint: ${directCoords.lat.toFixed(5)}° N, ${directCoords.lng.toFixed(5)}° E</span>`;
        }
        return;
      }

      // 2. Check if place name / address is recognized in the URL
      const placeName = extractPlaceNameFromGoogleUrl(val);
      if (placeName && statusSpan) {
        statusSpan.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400 font-bold">✓ Place recognized: "${escapeHtml(placeName)}"</span>`;
      }

      // 3. If short link (maps.app.goo.gl or goo.gl/maps), resolve asynchronously
      if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(val)) {
        if (statusSpan) {
          statusSpan.innerHTML = `<span class="text-blue-600 dark:text-blue-400 font-bold flex items-center gap-1.5"><span class="inline-block animate-spin">⏳</span> Detecting GPS coordinates from Google Maps link...</span>`;
        }

        clearTimeout(resolveDebounceTimer);
        resolveDebounceTimer = setTimeout(async () => {
          const resolved = await resolveShortGoogleMapsUrl(val);
          if (resolved && isValidLatLng(resolved.lat, resolved.lng)) {
            offLinkInput.dataset.detectedLat = resolved.lat;
            offLinkInput.dataset.detectedLng = resolved.lng;
            if (statusSpan) {
              statusSpan.innerHTML = `<span class="text-emerald-600 dark:text-emerald-400 font-bold">✓ Verified GPS Pinpoint: ${resolved.lat.toFixed(5)}° N, ${resolved.lng.toFixed(5)}° E</span>`;
            }
          } else if (statusSpan) {
            statusSpan.innerHTML = `<span class="text-blue-600 dark:text-blue-400">Google link received • Pin will be placed on map when saving</span>`;
          }
        }, 300);
        return;
      }

      if (statusSpan && !placeName) {
        statusSpan.innerHTML = `<span class="text-blue-600 dark:text-blue-400">Link received • GPS coordinates will be resolved upon saving</span>`;
      }
    };

    offLinkInput.addEventListener('input', handleLinkInput);
    offLinkInput.addEventListener('change', handleLinkInput);
    offLinkInput.addEventListener('paste', () => setTimeout(handleLinkInput, 50));
  }

  document.getElementById('search-input')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#per-office-components-container > div').forEach(card => {
      const text = card.textContent.toLowerCase();
      card.style.display = text.includes(q) ? 'flex' : 'none';
    });
  });

  document.getElementById('staff-search-input')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('.staff-comp-row').forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(q) ? 'grid' : 'none';
    });
  });
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-msg');
  if (!toast || !toastMsg) return;

  toastMsg.textContent = msg;
  toast.classList.remove('translate-y-24', 'opacity-0');
  toast.classList.add('translate-y-0', 'opacity-100');

  setTimeout(() => {
    toast.classList.add('translate-y-24', 'opacity-0');
    toast.classList.remove('translate-y-0', 'opacity-100');
  }, 2500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', initApp);

// =========================================================
// MONGODB ATLAS CLOUD SYNCHRONIZATION ENGINE
// =========================================================
const MONGO_API_BASE = (window.AURORA_BACKEND_URL)
  ? window.AURORA_BACKEND_URL
  : ((window.location.protocol === 'file:' || !window.location.port.includes('5000'))
    ? (window.location.protocol === 'https:' ? '' : 'http://localhost:5000')
    : '');
let isMongoOnline = false;
let mongoSyncTimeout = null;

async function checkMongoConnection(showToastAlert = false) {
  if (!MONGO_API_BASE && window.location.protocol === 'https:' && !window.location.origin.includes('localhost')) {
    isMongoOnline = false;
    updateMongoBadges(false);
    if (showToastAlert) {
      showToast(`Running on GitHub Pages in Static Mode (Local Cache Active)`, 'info');
    }
    return false;
  }
  try {
    const res = await fetch(`${MONGO_API_BASE}/api/status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      cache: 'no-cache'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.status === 'connected') {
      isMongoOnline = true;
      updateMongoBadges(true, data.latencyMs);
      updateMongoModalStats(data);
      if (showToastAlert) {
        showToast(`✓ MongoDB Atlas Live! Connected to ${data.database} (${data.latencyMs}ms)`, 'success');
      }
      return true;
    } else {
      throw new Error(data.message || 'MongoDB not connected');
    }
  } catch (err) {
    isMongoOnline = false;
    updateMongoBadges(false);
    if (showToastAlert) {
      showToast(`MongoDB Offline: Run "python server.py" to enable cloud sync.`, 'info');
    }
    return false;
  }
}

function updateMongoBadges(online, latencyMs = 0) {
  const badges = [
    document.getElementById('admin-mongo-badge'),
    document.getElementById('staff-mongo-badge')
  ];

  badges.forEach(b => {
    if (!b) return;
    const dot = b.querySelector('span:first-child');
    const text = b.querySelector('.mongo-badge-text');

    if (online) {
      b.classList.remove('bg-amber-50', 'text-amber-700', 'border-amber-200', 'dark:bg-amber-950/60', 'dark:text-amber-300', 'dark:border-amber-800');
      b.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200', 'dark:bg-emerald-950/60', 'dark:text-emerald-300', 'dark:border-emerald-800');
      if (dot) {
        dot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
      }
      if (text) text.textContent = latencyMs ? `🍃 MongoDB Live (${latencyMs}ms)` : '🍃 MongoDB Live';
    } else {
      b.classList.remove('bg-emerald-50', 'text-emerald-700', 'border-emerald-200', 'dark:bg-emerald-950/60', 'dark:text-emerald-300', 'dark:border-emerald-800');
      b.classList.add('bg-amber-50', 'text-amber-700', 'border-amber-200', 'dark:bg-amber-950/60', 'dark:text-amber-300', 'dark:border-amber-800');
      if (dot) {
        dot.className = 'w-2 h-2 rounded-full bg-amber-500';
      }
      if (text) text.textContent = '🍃 MongoDB Offline (Local)';
    }
  });

  const modalBadge = document.getElementById('mongo-modal-status-badge');
  if (modalBadge) {
    if (online) {
      modalBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200';
      modalBadge.textContent = 'CONNECTED (ONLINE)';
    } else {
      modalBadge.className = 'px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
      modalBadge.textContent = 'OFFLINE (LOCAL MODE)';
    }
  }
}

function updateMongoModalStats(data) {
  const counts = data.counts || {};
  const offEl = document.getElementById('mongo-count-offices');
  const stEl = document.getElementById('mongo-count-staff');
  const compEl = document.getElementById('mongo-count-components');

  if (offEl) offEl.textContent = counts.offices !== undefined ? counts.offices : state.offices.length;
  if (stEl) stEl.textContent = counts.staff !== undefined ? counts.staff : state.staff.length;
  if (compEl) compEl.textContent = counts.components !== undefined ? counts.components : state.components.length;
}

async function syncFromMongoDB(showToastAlert = false) {
  try {
    const res = await fetch(`${MONGO_API_BASE}/api/state`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      cache: 'no-cache'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();

    if (result && result.success && result.state) {
      const cloud = result.state;
      const hasCloudData = (cloud.offices && cloud.offices.length > 0) || (cloud.components && cloud.components.length > 0);
      const hasLocalData = (state.offices && state.offices.length > 0) || (state.components && state.components.length > 0);

      if (hasCloudData) {
        state.offices = cloud.offices || [];
        state.staff = cloud.staff || [];
        state.components = cloud.components || [];
        state.stocks = cloud.stocks || {};
        state.askRequests = cloud.askRequests || [];
        state.history = cloud.history || [];

        saveData(true);
        renderApp();
        if (selectedOfficeId && state.offices.some(o => o.id === selectedOfficeId)) {
          selectOffice(selectedOfficeId);
        } else if (state.offices.length > 0) {
          selectOffice(state.offices[0].id);
        }

        if (showToastAlert) {
          showToast(`✓ Pulled ${state.offices.length} offices & ${state.components.length} components from MongoDB Atlas!`, 'success');
        }
      } else if (hasLocalData) {
        await syncToMongoDB(false);
      }
      isMongoOnline = true;
      updateMongoBadges(true);
    }
  } catch (err) {
    console.warn("Could not sync from MongoDB Atlas:", err.message);
    if (showToastAlert) {
      showToast("Cannot connect to MongoDB Atlas backend. Using local storage.", "info");
    }
  }
}

async function syncToMongoDB(showToastAlert = false) {
  try {
    const payload = {
      offices: state.offices || [],
      staff: state.staff || [],
      components: state.components || [],
      stocks: state.stocks || {},
      askRequests: state.askRequests || [],
      history: (state.history || []).slice(0, 200)
    };

    const res = await fetch(`${MONGO_API_BASE}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data && data.success) {
      isMongoOnline = true;
      updateMongoBadges(true);
      if (showToastAlert) {
        showToast('✓ State successfully persisted to MongoDB Atlas!', 'success');
      }
      return true;
    }
  } catch (err) {
    console.warn("Could not push to MongoDB Atlas:", err.message);
    if (showToastAlert) {
      showToast("Failed to push to MongoDB Atlas. Ensure server.py is running.", "error");
    }
    return false;
  }
}

function queueMongoSync() {
  if (mongoSyncTimeout) clearTimeout(mongoSyncTimeout);
  mongoSyncTimeout = setTimeout(() => {
    syncToMongoDB(false);
  }, 400);
}

window.checkMongoConnection = checkMongoConnection;
window.syncFromMongoDB = syncFromMongoDB;
window.syncToMongoDB = syncToMongoDB;
