import os
import sys
import time
from flask import Flask, request, jsonify
from pymongo import MongoClient

MONGO_URI = os.environ.get(
    "MONGO_URI",
    "mongodb+srv://thirulingeshwart_db_user:tmNiQhs8ezdtJf19@cluster0.pavq1lb.mongodb.net/?retryWrites=true&w=majority"
)
DB_NAME = "aurora_loc_db"

app = Flask(__name__)

# Initialize MongoClient with connection pooling & 6s timeout
_client = None

def get_db():
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=6000, connectTimeoutMS=6000)
    return _client[DB_NAME]

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

@app.route('/api/status', methods=['GET', 'OPTIONS'])
@app.route('/status', methods=['GET', 'OPTIONS'])
def get_status():
    if request.method == 'OPTIONS':
        return '', 200

    try:
        db = get_db()
        t0 = time.time()
        db.command('ping')
        latency_ms = round((time.time() - t0) * 1000, 2)

        collections = db.list_collection_names()
        counts = {}
        for c in ['offices', 'staff', 'components', 'stocks', 'askRequests', 'history']:
            counts[c] = db[c].count_documents({}) if c in collections else 0

        return jsonify({
            "status": "connected",
            "connected": True,
            "database": DB_NAME,
            "cluster": "cluster0.pavq1lb.mongodb.net",
            "latencyMs": latency_ms,
            "collections": collections,
            "counts": counts,
            "timestamp": time.time(),
            "environment": "Vercel Serverless"
        })
    except Exception as e:
        return jsonify({
            "status": "disconnected",
            "connected": False,
            "error": str(e),
            "message": "Could not connect to MongoDB Atlas cluster"
        }), 503

@app.route('/api/state', methods=['GET', 'POST', 'OPTIONS'])
@app.route('/state', methods=['GET', 'POST', 'OPTIONS'])
def handle_state():
    if request.method == 'OPTIONS':
        return '', 200

    try:
        db = get_db()
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 503

    if request.method == 'GET':
        try:
            offices = list(db['offices'].find())
            for o in offices:
                o['id'] = o.get('_id', o.get('id'))
                if '_id' in o: del o['_id']

            staff_list = list(db['staff'].find())
            for s in staff_list:
                s['id'] = s.get('_id', s.get('id'))
                if '_id' in s: del s['_id']

            components = list(db['components'].find())
            for c in components:
                c['id'] = c.get('_id', c.get('id'))
                if '_id' in c: del c['_id']

            stocks = {}
            stocks_doc = db['meta'].find_one({"_id": "app_stocks"})
            if stocks_doc and 'stocks' in stocks_doc:
                stocks = stocks_doc['stocks']

            ask_requests = list(db['askRequests'].find().sort('date', -1))
            for r in ask_requests:
                r['id'] = r.get('_id', r.get('id'))
                if '_id' in r: del r['_id']

            history = list(db['history'].find().sort('date', -1))
            for h in history:
                h['id'] = h.get('_id', h.get('id'))
                if '_id' in h: del h['_id']

            meta_doc = db['meta'].find_one({"_id": "app_info"})

            return jsonify({
                "success": True,
                "source": "MongoDB Atlas",
                "database": DB_NAME,
                "state": {
                    "currentUser": {
                        "username": "admin",
                        "name": "Admin User",
                        "email": "admin@aurora.com",
                        "role": "Admin"
                    },
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

    elif request.method == 'POST':
        payload = request.get_json(force=True, silent=True)
        if not payload:
            return jsonify({"error": "Invalid JSON"}), 400

        try:
            now_iso = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

            # 1. Offices
            offices = payload.get('offices', [])
            incoming_off_ids = []
            for off in offices:
                off_id = off.get('id')
                if not off_id: continue
                incoming_off_ids.append(off_id)
                doc = dict(off)
                doc['_id'] = off_id
                db['offices'].replace_one({"_id": off_id}, doc, upsert=True)
            if incoming_off_ids:
                db['offices'].delete_many({"_id": {"$nin": incoming_off_ids}})
            elif len(offices) == 0:
                db['offices'].delete_many({})

            # 2. Staff
            staff_list = payload.get('staff', [])
            incoming_st_ids = []
            for st in staff_list:
                st_id = st.get('id')
                if not st_id: continue
                incoming_st_ids.append(st_id)
                doc = dict(st)
                doc['_id'] = st_id
                db['staff'].replace_one({"_id": st_id}, doc, upsert=True)
            if incoming_st_ids:
                db['staff'].delete_many({"_id": {"$nin": incoming_st_ids}})
            elif len(staff_list) == 0:
                db['staff'].delete_many({})

            # 3. Components
            components = payload.get('components', [])
            incoming_comp_ids = []
            for comp in components:
                comp_id = comp.get('id')
                if not comp_id: continue
                incoming_comp_ids.append(comp_id)
                doc = dict(comp)
                doc['_id'] = comp_id
                db['components'].replace_one({"_id": comp_id}, doc, upsert=True)
            if incoming_comp_ids:
                db['components'].delete_many({"_id": {"$nin": incoming_comp_ids}})
            elif len(components) == 0:
                db['components'].delete_many({})

            # 4. Stocks
            stocks = payload.get('stocks', {})
            db['meta'].update_one(
                {"_id": "app_stocks"},
                {"$set": {"stocks": stocks, "updatedAt": now_iso}},
                upsert=True
            )

            # 5. Ask Requests
            ask_requests = payload.get('askRequests', [])
            incoming_req_ids = []
            for req_item in ask_requests:
                req_id = req_item.get('id')
                if not req_id: continue
                incoming_req_ids.append(req_id)
                doc = dict(req_item)
                doc['_id'] = req_id
                db['askRequests'].replace_one({"_id": req_id}, doc, upsert=True)
            if incoming_req_ids:
                db['askRequests'].delete_many({"_id": {"$nin": incoming_req_ids}})
            elif len(ask_requests) == 0:
                db['askRequests'].delete_many({})

            # 6. History
            history = payload.get('history', [])
            for h in history[:200]:
                h_id = h.get('id')
                if not h_id: continue
                doc = dict(h)
                doc['_id'] = h_id
                db['history'].replace_one({"_id": h_id}, doc, upsert=True)

            # 7. Meta
            db['meta'].update_one(
                {"_id": "app_info"},
                {"$set": {
                    "appName": "AURORA LOC",
                    "database": DB_NAME,
                    "cluster": "cluster0.pavq1lb.mongodb.net",
                    "lastSynced": now_iso,
                    "officeCount": len(offices),
                    "staffCount": len(staff_list),
                    "componentCount": len(components)
                }},
                upsert=True
            )

            return jsonify({
                "success": True,
                "message": "Persisted to MongoDB Atlas via Vercel Function",
                "lastSynced": now_iso
            })
        except Exception as e:
            return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)
