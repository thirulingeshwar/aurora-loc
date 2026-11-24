# AURORA LOC APP — List of Components & Office Tracking
> **Clean Database Ready for Live Company Data Entry**

- **Live GitHub Pages URL**: [https://thirulingeshwar.github.io/aurora-loc/](https://thirulingeshwar.github.io/aurora-loc/)
- **GitHub Repository**: [https://github.com/thirulingeshwar/aurora-loc](https://github.com/thirulingeshwar/aurora-loc)

---

## 📐 Blueprint Implementation Overview

This application is built directly from your **architectural hand-drawn wireframe sketch**:

```
[START -> Login IN] ──> [Database & Admin EMAIL ID Display]
         │
         ├──> [LEFT ACTION BAR]: Ask | MOVING | Received | History | New
         │
         ├──> [CENTER]: Office Location Map (Google Maps API + Blueprint Sketch)
         │
         ├──> [RIGHT TOP]: Office List (Pin 1, 2, 3, 4, 5...)
         │
         ├──> [RIGHT BOTTOM]: Per Office List of Components
         │     ├── Office Name & Staff In-Charge
         │     └── List: [Component Image] [Component Name] [Count]
         │
         └──> ["ASKING" DRAWER]:
               ├── [Office Name Dropdown]
               ├── [Staff Name]
               └── Asked Components List: [Image] [Component Name] [Count]
```

---

## 🧹 Database Status: Clean & Ready for Real Data

All dummy/sample components, branch offices, staff members, and history records have been wiped clean. Only the **Admin** access account is retained so you can manage and build your company database through the **"New"** admin suite:

- **Admin Login**:
  - **Username**: `admin`
  - **Password**: `aurora123`
  - **Admin Email**: `admin@aurora.com` (displayed in the top header)

---

## 🛠️ Step-by-Step Guide to Populate Your Company Data

### Step 1: Add Your Company Branch Offices (5 Fields & Automatic Google Maps Photo)
1. Click **"New"** on the left menu &rarr; **"Office / Map Pin"** tab.
2. Fill in only the 5 required details:
   - **Office / Branch Name**: (e.g. *Chennai Central Hub*, *Madurai Innovation Plant*)
   - **Google Location Link**: (Paste any Google Maps link like `https://maps.app.goo.gl/...` or `@lat,lng` or direct coordinates)
   - **Staff Name**: (e.g. *K. Thirulingeshwar*)
   - **Staff Number (Phone)**: (e.g. *+91 98400 12345*)
   - **Email ID**: (e.g. *manager@aurora.com*)
   *(No image upload needed: the office photo is automatically captured directly from the Google Map link!)*
3. Click **"Save & Plot Office Pin on Map"**.
4. The system automatically detects GPS coordinates, captures the high-resolution location photo from the Google Maps link, plots the pin on the map, and displays your office with its image, staff contacts, and direct Google Maps link!

### Step 2: Add Your Components
1. Click **"New"** &rarr; **"Component"** tab.
2. Fill in the details:
   - **Component Code**: (e.g. `ESP-32-WROOM`, `RES-10K-0805`, `OLED-0.96-I2C`)
   - **Component Name**: (e.g. *ESP32 WiFi + BLE MCU Module*)
   - **Category**: (e.g. *Microcontrollers*, *Sensors*, *Displays*)
   - **Unit**: (e.g. `pcs`, `reels`, `kits`)
   - **Component Picture**: Upload a picture from your computer or paste an image URL.
   - **Initial Stock per Office**: Enter how many units this office currently holds.
3. Click **"Save Component & Stock"**.

### Step 3: Manage Inventory Flows
- **Ask (Requisition)**: Branch staff can select their office and request needed components and quantities. The Admin can review and click **"Fulfill"** to dispatch the components.
- **Moving (Transfers)**: Move components between office branches with automated quantity validation.
- **Received (Stock In)**: Add inward stock shipments into any office location.
- **History**: Audit trail of every move, requisition, and receipt.
- **Export & Backup**: In **"New" &rarr; "Bulk / Backup"**, export inventory reports to Excel/CSV or download a full JSON backup.

---

## 🗺️ Maps Setup
- **Google Maps**: Integrated with your API key (`AIzaSyD9pts0K8uAe8vL2gI1EcIyc0p6S1pB6tQ`).
- **Blueprint Sketch Map**: Switchable with 1-click to view the blueprint peninsula map matching your hand-drawn drawing.
- **OpenStreetMap (Leaflet)**: Secondary fallback that works anywhere without credentials.

---

## 🍃 MongoDB Atlas Cloud Database Integration

The application is connected directly to your **MongoDB Atlas Cloud Database**:
- **Cluster**: `cluster0.pavq1lb.mongodb.net`
- **Database**: `aurora_loc_db`
- **Username**: `thirulingeshwart_db_user`
- **Collections Managed**:
  - `offices`: Branch offices, Google location links, GPS coordinates, staff assignments.
  - `staff`: Branch staff logins, roles, credentials.
  - `components`: Inventory components catalog, codes, units, and images.
  - `stocks`: Real-time stock counts across branch offices.
  - `askRequests`: Requisitions submitted by staff to Admin.
  - `history`: Complete movement & requisition audit logs.
  - `meta`: App metadata and sync timestamps.

### How to Run with MongoDB Atlas:
1. **Option 1 (Recommended)**: Double-click **`start_app.bat`**.
   - Starts the Python MongoDB backend server (`server.py`).
   - Automatically opens your browser to `http://localhost:5000`.
   - Your data is synchronized directly to your cloud MongoDB Atlas database in real-time!
2. **Option 2 (Terminal)**:
   ```bash
   python server.py
   ```
   Then open `http://localhost:5000`.
3. **Option 3 (Direct File / Standalone)**:
   - Double-click `index.html` directly in any web browser.
   - The app uses its resilient local cache and connects to MongoDB whenever `server.py` is active.

---

## 🚀 How to Open and Run

1. Navigate to:
   `c:\Users\thiru\OneDrive\Desktop\K.Thirulingeshwar\aurora\LOC`
2. **Double-click `index.html`** in any web browser.
3. Enter your login (`admin` / `aurora123`).
4. Begin adding your real offices and components via **"New"**!
