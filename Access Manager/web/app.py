from flask import Flask, render_template, request, redirect, url_for, jsonify, session
import json
import os
import secrets
from functools import wraps

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

# Database file paths
USERS_DB = 'db/users.json'
SERVERS_DB = 'db/servers.json'

# Ensure database directory exists
os.makedirs('db', exist_ok=True)

# Initialize empty databases if they don't exist
if not os.path.exists(USERS_DB):
    with open(USERS_DB, 'w') as f:
        json.dump({
            # Default admin user
            "admin": {"password": "password"}
        }, f)

if not os.path.exists(SERVERS_DB):
    with open(SERVERS_DB, 'w') as f:
        json.dump({
            # Example server with some Steam IDs
            "CS:S Server #1": {
                "steamids": {
                    "STEAM_0:1:12345678": "Mireda",
                    "STEAM_0:0:87654321": "Milad"
                },
                "ip": "192.168.1.1",
                "port": "27015",
                "rcon": "rconpw"
            },
            "CS:S Server #2": {
                "steamids": {},
                "ip": "192.168.1.1",
                "port": "27016",
                "rcon": "rconpw"
            }
        }, f)

# Auth decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'username' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# Routes
@app.route('/')
def index():
    if 'username' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        with open(USERS_DB, 'r') as f:
            users = json.load(f)
        
        if username in users and users[username]['password'] == password:
            session['username'] = username
            return redirect(url_for('dashboard'))
        else:
            error = 'Invalid credentials. Please try again.'
    
    return render_template('login.html', error=error)

@app.route('/logout')
def logout():
    session.pop('username', None)
    return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    with open(SERVERS_DB, 'r') as f:
        servers = json.load(f)
    
    server_names = list(servers.keys())
    
    return render_template('dashboard.html', 
                         username=session['username'],
                         servers=server_names)

@app.route('/api/check/<server_name>/test')
def test_server_name(server_name):
    """Test endpoint for verifying server name resolution"""
    app.logger.info(f"Testing server name: '{server_name}'")
    
    with open(SERVERS_DB, 'r') as f:
        servers = json.load(f)
    
    # Get a list of all server names
    available_servers = list(servers.keys())
    
    # Check if the server exists directly
    server_exists = server_name in servers
    
    # Check for case-insensitive match
    case_insensitive_match = False
    matching_server = None
    
    if not server_exists:
        server_name_lower = server_name.lower()
        for stored_name in available_servers:
            if stored_name.lower() == server_name_lower:
                case_insensitive_match = True
                matching_server = stored_name
                break
    
    # Return detailed information
    return jsonify({
        "test": "server_name_resolution",
        "requested_server_name": server_name,
        "server_exists": server_exists,
        "case_insensitive_match": case_insensitive_match,
        "matching_server": matching_server,
        "available_servers": available_servers
    })

@app.route('/api/ping')
def ping():
    """Simple ping endpoint to test API connectivity"""
    return jsonify({
        "status": "ok",
        "version": "1.1.0",
        "message": "CS:S Access Manager API is running"
    })

# Server Management APIs
@app.route('/api/servers', methods=['GET'])
@login_required
def get_all_servers():
    with open(SERVERS_DB, 'r') as f:
        servers = json.load(f)
    
    # Convert to a list of server objects with names
    server_list = []
    for name, details in servers.items():
        server_data = details.copy()
        server_data['name'] = name
        server_data['steamid_count'] = len(details.get('steamids', {}))
        server_list.append(server_data)
    
    return jsonify(server_list)

@app.route('/api/server', methods=['POST'])
@login_required
def add_server():
    data = request.json
    server_name = data.get('name')
    ip = data.get('ip', '')
    port = data.get('port', '')
    rcon = data.get('rcon', '')
    
    if not server_name:
        return jsonify({"error": "Server name is required"}), 400
    
    with open(SERVERS_DB, 'r') as f:
        servers = json.load(f)
    
    if server_name in servers:
        return jsonify({"error": "Server with this name already exists"}), 400
    
    servers[server_name] = {
        "steamids": {},
        "ip": ip,
        "port": port,
        "rcon": rcon
    }
    
    with open(SERVERS_DB, 'w') as f:
        json.dump(servers, f, indent=4)
    
    return jsonify({"success": True})

@app.route('/api/server/<server_name>', methods=['PUT'])
@login_required
def update_server(server_name):
    data = request.json
    new_name = data.get('name')
    ip = data.get('ip')
    port = data.get('port')
    rcon = data.get('rcon')
    
    with open(SERVERS_DB, 'r') as f:
        servers = json.load(f)
    
    if server_name not in servers:
        return jsonify({"error": "Server not found"}), 404
    
    # If name is changing, we need to create a new entry and delete the old one
    if new_name and new_name != server_name and new_name in servers:
        return jsonify({"error": "A server with the new name already exists"}), 400
    
    server_data = servers[server_name].copy()
    
    if ip is not None:
        server_data['ip'] = ip
    if port is not None:
        server_data['port'] = port
    if rcon is not None:
        server_data['rcon'] = rcon
    
    if new_name and new_name != server_name:
        # Create entry with new name
        servers[new_name] = server_data
        # Delete old entry
        del servers[server_name]
    else:
        # Update existing entry
        servers[server_name] = server_data
    
    with open(SERVERS_DB, 'w') as f:
        json.dump(servers, f, indent=4)
    
    return jsonify({"success": True})

@app.route('/api/server/<server_name>', methods=['DELETE'])
@login_required
def delete_server(server_name):
    with open(SERVERS_DB, 'r') as f:
        servers = json.load(f)
    
    if server_name not in servers:
        return jsonify({"error": "Server not found"}), 404
    
    del servers[server_name]
    
    with open(SERVERS_DB, 'w') as f:
        json.dump(servers, f, indent=4)
    
    return jsonify({"success": True})

@app.route('/api/server/<server_name>', methods=['GET'])
@login_required
def get_server(server_name):
    with open(SERVERS_DB, 'r') as f:
        servers = json.load(f)
    
    if server_name in servers:
        return jsonify(servers[server_name])
    else:
        return jsonify({"error": "Server not found"}), 404

@app.route('/api/server/<server_name>/steamid', methods=['POST'])
@login_required
def add_steamid(server_name):
    data = request.json
    steamid = data.get('steamid')
    name = data.get('name')
    
    if not steamid or not name:
        return jsonify({"error": "SteamID and Name are required"}), 400
    
    with open(SERVERS_DB, 'r') as f:
        servers = json.load(f)
    
    if server_name not in servers:
        return jsonify({"error": "Server not found"}), 404
    
    servers[server_name]['steamids'][steamid] = name
    
    with open(SERVERS_DB, 'w') as f:
        json.dump(servers, f, indent=4)
    
    return jsonify({"success": True})

@app.route('/api/server/<server_name>/steamid/<steamid>', methods=['PUT'])
@login_required
def edit_steamid(server_name, steamid):
    data = request.json
    name = data.get('name')
    
    if not name:
        return jsonify({"error": "Name is required"}), 400
    
    with open(SERVERS_DB, 'r') as f:
        servers = json.load(f)
    
    if server_name not in servers:
        return jsonify({"error": "Server not found"}), 404
    
    if steamid not in servers[server_name]['steamids']:
        return jsonify({"error": "SteamID not found"}), 404
    
    servers[server_name]['steamids'][steamid] = name
    
    with open(SERVERS_DB, 'w') as f:
        json.dump(servers, f, indent=4)
    
    return jsonify({"success": True})

@app.route('/api/server/<server_name>/steamid/<steamid>', methods=['DELETE'])
@login_required
def delete_steamid(server_name, steamid):
    with open(SERVERS_DB, 'r') as f:
        servers = json.load(f)
    
    if server_name not in servers:
        return jsonify({"error": "Server not found"}), 404
    
    if steamid not in servers[server_name]['steamids']:
        return jsonify({"error": "SteamID not found"}), 404
    
    del servers[server_name]['steamids'][steamid]
    
    with open(SERVERS_DB, 'w') as f:
        json.dump(servers, f, indent=4)
    
    return jsonify({"success": True})



@app.route('/api/check/<server_name>/<steamid>/debug', methods=['GET'])
@login_required
def debug_steamid_check(server_name, steamid):
    """Admin endpoint to debug SteamID checks"""
    with open(SERVERS_DB, 'r') as f:
        servers = json.load(f)
    
    # Prepare debugging info
    debug_info = {
        "request": {
            "server_name": server_name,
            "steamid": steamid,
        },
        "server_exists": server_name in servers,
        "available_servers": list(servers.keys()),
    }
    
    # If server exists, add more details
    if server_name in servers:
        available_steamids = list(servers[server_name]['steamids'].keys())
        debug_info["available_steamids"] = available_steamids
        debug_info["direct_match"] = steamid in servers[server_name]['steamids']
        
        # Check for case-insensitive match
        steamid_lower = steamid.lower()
        case_insensitive_match = False
        matching_id = None
        
        for stored_id in available_steamids:
            if stored_id.lower() == steamid_lower:
                case_insensitive_match = True
                matching_id = stored_id
                break
        
        debug_info["case_insensitive_match"] = case_insensitive_match
        debug_info["matching_id"] = matching_id
    
    return jsonify(debug_info)

def normalize_steamid(steamid):
    """
    Normalize SteamID to a consistent format for comparison.
    Handles the specific format STEAM_0A0A538259522 properly.
    """
    # Log the original SteamID for debugging
    app.logger.info(f"Normalizing SteamID: '{steamid}'")
    
    # If it's empty or None, return as is
    if not steamid:
        return steamid
    
    # Check if it's already in standard format (STEAM_X:Y:Z)
    if steamid.count(':') == 2 and steamid.startswith('STEAM_'):
        app.logger.info(f"SteamID already in standard format: {steamid}")
        return steamid
    
    # If it doesn't start with STEAM_, return as is
    if not steamid.startswith('STEAM_'):
        app.logger.info(f"Not a SteamID format, returning as is: {steamid}")
        return steamid
    
    # Handle the specific format STEAM_0A0A538259522
    if steamid.count('A') == 2 and steamid.startswith('STEAM_'):
        try:
            # Remove "STEAM_" prefix
            remainder = steamid[6:]
            # Split by 'A'
            parts = remainder.split('A')
            
            if len(parts) == 3:
                universe = parts[0]       # First part (usually "0")
                account_type = parts[1]   # Second part (usually "0" or "1")
                account_id = parts[2]     # Third part (the account ID)
                
                # Reconstruct in standard format
                normalized = f"STEAM_{universe}:{account_type}:{account_id}"
                app.logger.info(f"Normalized from A format: '{steamid}' -> '{normalized}'")
                return normalized
        except Exception as e:
            app.logger.error(f"Error normalizing SteamID {steamid}: {str(e)}")
    
    # If we reach here, try a generic approach
    app.logger.info(f"Using generic normalization for: {steamid}")
    
    try:
        # Extract all digits
        digits = ''.join(c for c in steamid if c.isdigit())
        
        if len(digits) >= 3:  # Need at least a few digits
            # Simple assumption: first digit is universe, second is account type
            universe = digits[0]
            account_type = digits[1]
            account_id = digits[2:]
            
            normalized = f"STEAM_{universe}:{account_type}:{account_id}"
            app.logger.info(f"Generic normalization result: '{normalized}'")
            return normalized
    except Exception as e:
        app.logger.error(f"Error in generic normalization for {steamid}: {str(e)}")
    
    # If all else fails, return the original
    app.logger.warning(f"Could not normalize SteamID: {steamid}")
    return steamid

@app.route('/api/test/steamid/<steamid>')
def test_steamid_normalization(steamid):
    """Test endpoint for SteamID normalization"""
    normalized = normalize_steamid(steamid)
    
    return jsonify({
        "original": steamid,
        "normalized": normalized,
        "length": len(steamid),
        "normalized_length": len(normalized),
        "contains_colons": ":" in steamid,
        "contains_A": "A" in steamid,
        "digit_count": sum(c.isdigit() for c in steamid)
    })


# For CS:Source server to check if a SteamID is allowed
@app.route('/api/check/<server_name>/<steamid>')
def check_steamid(server_name, steamid):
    # Add logging to see what's being checked
    app.logger.info(f"Checking access for server: '{server_name}', SteamID: '{steamid}'")
    
    with open(SERVERS_DB, 'r') as f:
        servers = json.load(f)
    
    app.logger.info(f"Available servers: {list(servers.keys())}")
    
    # Check if the server exists
    if server_name not in servers:
        app.logger.warning(f"Server not found: '{server_name}'")
        return jsonify({"allowed": False, "reason": "Server not found"})
    
    # Log the available SteamIDs for debugging
    available_steamids = list(servers[server_name]['steamids'].keys())
    app.logger.info(f"Available SteamIDs: {available_steamids}")
    
    # First, normalize the SteamID format
    normalized_steamid = normalize_steamid(steamid)
    app.logger.info(f"Normalized SteamID: '{normalized_steamid}'")
    
    # Check if normalized SteamID exists
    allowed = False
    matched_id = None
    
    # Try direct match with normalized ID
    for stored_id in available_steamids:
        normalized_stored_id = normalize_steamid(stored_id)
        if normalized_stored_id == normalized_steamid:
            allowed = True
            matched_id = stored_id
            app.logger.info(f"Found matching SteamID: {matched_id}")
            break
    
    app.logger.info(f"SteamID allowed: {allowed}")
    
    # Return the result
    return jsonify({
        "allowed": allowed,
        "name": servers[server_name]['steamids'].get(matched_id, "Unknown") if matched_id else "Unknown"
    })

if __name__ == '__main__':
    app.run(debug=True,host='0.0.0.0', port=15500)
