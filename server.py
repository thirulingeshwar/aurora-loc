import os
import sys
import time
from flask import Flask, request, jsonify, send_from_directory
from pymongo import MongoClient
from pymongo.errors import PyMongoError, ServerSelectionTimeoutError

# =========================================================
# CONFIGURATION
# =========================================================
MONGO_URI = "mongodb+srv://thirulingeshwart_db_user:tmNiQhs8ezdtJf19@cluster0.pavq1lb.mongodb.net/?retryWrites=true&w=majority"
DB_NAME = "aurora_loc_db"
PORT = 5000
HOST = "0.0.0.0"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__, static_folder=BASE_DIR)

# MongoDB Client Setup with 5s timeout
try:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=6000)
    db = client[DB_NAME]
except Exception as e:
    print(f"Error initializing MongoClient: {e}")
    client = None
    db = None

# =========================================================
# CORS HEADERS (Natively supported for all origins)
# =========================================================
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

# =========================================================
# STATIC FILE SERVING
# =========================================================
@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(BASE_DIR, path)):
        return send_from_directory(BASE_DIR, path)
    return jsonify({"error": "File not found"}), 404

# =========================================================
# API: HEALTH & MONGODB STATUS
# =========================================================
@app.route('/api/status', methods=['GET'])
def get_status():
    if not client or db is None:
        return jsonify({
            "status": "error",
            "connected": False,
            "message": "MongoDB client is not initialized"
        }), 500

    try:
        t0 = time.time()
        client.admin.command('ping')
        latency_ms = round((time.time() - t0) * 1000, 2)

        collections = db.list_collection_names()
        counts = {}
        for c in ['offices', 'staff', 'components', 'stocks', 'askRequests', 'history']:
            if c in collections:
                counts[c] = db[c].count_documents({})
            else:
                counts[c] = 0

        return jsonify({
            "status": "connected",
            "connected": True,
            "database": DB_NAME,
            "cluster": "cluster0.pavq1lb.mongodb.net",
            "latencyMs": latency_ms,
            "collections": collections,
            "counts": counts,
            "timestamp": time.time()
        })
    except Exception as e:
        return jsonify({
            "status": "disconnected",
            "connected": False,
            "error": str(e),
            "message": "Could not connect to MongoDB Atlas cluster"
        }), 503

# =========================================================
# API: GET STATE (Full state from MongoDB)
# =========================================================
@app.route('/api/state', methods=['GET'])
def get_state():
    if not client or db is None:
        return jsonify({"error": "MongoDB client not connected"}), 503

    try:
        # 1. Offices
        offices = []
        for o in db['offices'].find():
            o['id'] = o.get('_id', o.get('id'))
            if '_id' in o and isinstance(o['_id'], str):
                del o['_id']
            elif '_id' in o:
                del o['_id']
            offices.append(o)

        # 2. Staff
        staff_list = []
        for s in db['staff'].find():
            s['id'] = s.get('_id', s.get('id'))
            if '_id' in s:
                del s['_id']
            staff_list.append(s)

        # 3. Components
        components = []
        for c in db['components'].find():
            c['id'] = c.get('_id', c.get('id'))
            if '_id' in c:
                del c['_id']
            components.append(c)

        # 4. Stocks (stored in a single document or per-key)
        stocks = {}
        stocks_doc = db['meta'].find_one({"_id": "app_stocks"})
        if stocks_doc and 'stocks' in stocks_doc:
            stocks = stocks_doc['stocks']
        else:
            # Fallback check per-item stocks collection
            for st in db['stocks'].find():
                key = st.get('key') or f"{st.get('componentId')}_{st.get('officeId')}"
                if key:
                    stocks[key] = st.get('count', 0)

        # 5. Ask Requests
        ask_requests = []
        for r in db['askRequests'].find().sort('date', -1):
            r['id'] = r.get('_id', r.get('id'))
            if '_id' in r:
                del r['_id']
            ask_requests.append(r)

        # 6. Movement / Audit History
        history = []
        for h in db['history'].find().sort('date', -1):
            h['id'] = h.get('_id', h.get('id'))
            if '_id' in h:
                del h['_id']
            history.append(h)

        # 7. Current User / Meta
        current_user = {
            "username": "admin",
            "name": "Admin User",
            "email": "admin@aurora.com",
            "role": "Admin"
        }
        meta_doc = db['meta'].find_one({"_id": "app_info"})

        return jsonify({
            "success": True,
            "source": "MongoDB Atlas",
            "database": DB_NAME,
            "state": {
                "currentUser": current_user,
                "offices": offices,
                "staff": staff_list,
                "components": components,
                "stocks": stocks,
                "askRequests": ask_requests,
                "history": history
            },
            "lastSynced": meta_doc.get('lastSynced') if meta_doc else None
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# =========================================================
# API: POST STATE (Save/Sync entire state to MongoDB)
# =========================================================
@app.route('/api/state', methods=['POST'])
def save_state():
    if not client or db is None:
        return jsonify({"error": "MongoDB client not connected"}), 503

    payload = request.get_json(force=True, silent=True)
    if not payload:
        return jsonify({"error": "Invalid JSON payload"}), 400

    try:
        now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

        # 1. Sync Offices
        offices = payload.get('offices', [])
        incoming_off_ids = []
        for off in offices:
            off_id = off.get('id')
            if not off_id:
                continue
            incoming_off_ids.append(off_id)
            doc = dict(off)
            doc['_id'] = off_id
            db['offices'].replace_one({"_id": off_id}, doc, upsert=True)
        # Remove deleted offices
        if incoming_off_ids:
            db['offices'].delete_many({"_id": {"$nin": incoming_off_ids}})
        elif len(offices) == 0:
            db['offices'].delete_many({})

        # 2. Sync Staff
        staff_list = payload.get('staff', [])
        incoming_st_ids = []
        for st in staff_list:
            st_id = st.get('id')
            if not st_id:
                continue
            incoming_st_ids.append(st_id)
            doc = dict(st)
            doc['_id'] = st_id
            db['staff'].replace_one({"_id": st_id}, doc, upsert=True)
        if incoming_st_ids:
            db['staff'].delete_many({"_id": {"$nin": incoming_st_ids}})
        elif len(staff_list) == 0:
            db['staff'].delete_many({})

        # 3. Sync Components
        components = payload.get('components', [])
        incoming_comp_ids = []
        for comp in components:
            comp_id = comp.get('id')
            if not comp_id:
                continue
            incoming_comp_ids.append(comp_id)
            doc = dict(comp)
            doc['_id'] = comp_id
            db['components'].replace_one({"_id": comp_id}, doc, upsert=True)
        if incoming_comp_ids:
            db['components'].delete_many({"_id": {"$nin": incoming_comp_ids}})
        elif len(components) == 0:
            db['components'].delete_many({})

        # 4. Sync Stocks
        stocks = payload.get('stocks', {})
        db['meta'].update_one(
            {"_id": "app_stocks"},
            {"$set": {"stocks": stocks, "updatedAt": now_iso}},
            upsert=True
        )

        # 5. Sync Ask Requests
        ask_requests = payload.get('askRequests', [])
        incoming_req_ids = []
        for req_item in ask_requests:
            req_id = req_item.get('id')
            if not req_id:
                continue
            incoming_req_ids.append(req_id)
            doc = dict(req_item)
            doc['_id'] = req_id
            db['askRequests'].replace_one({"_id": req_id}, doc, upsert=True)
        if incoming_req_ids:
            db['askRequests'].delete_many({"_id": {"$nin": incoming_req_ids}})
        elif len(ask_requests) == 0:
            db['askRequests'].delete_many({})

        # 6. Sync History
        history = payload.get('history', [])
        incoming_hist_ids = []
        for h in history[:200]: # keep top 200 history logs
            h_id = h.get('id')
            if not h_id:
                continue
            incoming_hist_ids.append(h_id)
            doc = dict(h)
            doc['_id'] = h_id
            db['history'].replace_one({"_id": h_id}, doc, upsert=True)

        # 7. Update Meta
        db['meta'].update_one(
            {"_id": "app_info"},
            {"$set": {
                "appName": "AURORA LOC",
                "database": DB_NAME,
                "cluster": "cluster0.pavq1lb.mongodb.net",
                "lastSynced": now_iso,
                "officeCount": len(offices),
                "staffCount": len(staff_list),
                "componentCount": len(components),
                "requestCount": len(ask_requests)
            }},
            upsert=True
        )

        return jsonify({
            "success": True,
            "message": "State successfully persisted to MongoDB Atlas",
            "lastSynced": now_iso
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# =========================================================
# START SERVER
# =========================================================
if __name__ == '__main__':
    print("=" * 60)
    print("🚀 AURORA LOC — MongoDB Atlas Connected Backend")
    print("=" * 60)
    print(f"Database: {DB_NAME}")
    print(f"Cluster:  cluster0.pavq1lb.mongodb.net")
    print(f"URL:      http://localhost:{PORT}")
    print("=" * 60)
    app.run(host=HOST, port=PORT, debug=False)
