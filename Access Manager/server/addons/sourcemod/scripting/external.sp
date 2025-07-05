#include <sourcemod>
#include <sdktools>
#include <system2>
#include <json>

#pragma semicolon 1
#pragma newdecls required

// Plugin Info
#define PLUGIN_VERSION "1.1.0"
public Plugin myinfo = {
    name = "Source Engine Access Manager",
    author = "Mireda",
    description = "Restricts server access to allowed Steam IDs",
    version = PLUGIN_VERSION,
    url = ""
};

// ConVars
ConVar g_cvApiUrl;
ConVar g_cvServerName;
ConVar g_cvCheckInterval;
ConVar g_cvAllowAdmins;
ConVar g_cvDebugMode;
ConVar g_cvFailOpen;

// Plugin state
bool g_bLateLoad = false;
char g_sServerName[128];
bool g_bDebugMode = false;

// SourceMod forwards
public APLRes AskPluginLoad2(Handle myself, bool late, char[] error, int err_max) {
    g_bLateLoad = late;
    return APLRes_Success;
}

public void OnPluginStart() {
    CreateConVar("sm_accessmanager_version", PLUGIN_VERSION, "CS:Source Access Manager Version", FCVAR_REPLICATED|FCVAR_NOTIFY|FCVAR_SPONLY|FCVAR_DONTRECORD);
    
    // Create ConVars
    g_cvApiUrl = CreateConVar("sm_accessmanager_api_url", "http://localhost:15500/api/check", "Base URL of the Access Manager API (without trailing slash)");
    g_cvServerName = CreateConVar("sm_accessmanager_server_name", "sv1", "Server name as configured in the Access Manager panel");
    g_cvCheckInterval = CreateConVar("sm_accessmanager_check_interval", "60.0", "How often (in seconds) to recheck connected players", _, true, 60.0);
    g_cvAllowAdmins = CreateConVar("sm_accessmanager_allow_admins", "0", "Always allow admins to connect regardless of the allowlist", _, true, 0.0, true, 1.0);
    g_cvDebugMode = CreateConVar("sm_accessmanager_debug", "0", "Enable debug logging", _, true, 0.0, true, 1.0);
    g_cvFailOpen = CreateConVar("sm_accessmanager_fail_open", "1", "If set to 1, allows players to connect when API is unreachable; if 0, denies access", _, true, 0.0, true, 1.0);
    
    // Load/create config
    AutoExecConfig(true, "Mireda_access_manager");
    
    // Hook events
    HookEvent("player_connect", Event_PlayerConnect, EventHookMode_Pre);
    
    // Admin commands
    RegAdminCmd("sm_allowlist_reload", Command_ReloadAllowlist, ADMFLAG_RCON, "Reload the allowlist from the API");
    RegAdminCmd("sm_allowlist_check", Command_CheckPlayer, ADMFLAG_RCON, "Check if a player is on the allowlist");
    RegAdminCmd("sm_allowlist_status", Command_AllowlistStatus, ADMFLAG_RCON, "Check the allowlist system status");
	RegAdminCmd("sm_allowlist_test_server", Command_TestServerName, ADMFLAG_RCON, "Test server name encoding and API connection");    
    // Load cvar values
    g_cvServerName.GetString(g_sServerName, sizeof(g_sServerName));
    g_bDebugMode = g_cvDebugMode.BoolValue;
    
    // Process currently connected players if late load
    if (g_bLateLoad) {
        for (int i = 1; i <= MaxClients; i++) {
            if (IsClientConnected(i) && !IsFakeClient(i) && IsClientAuthorized(i)) {
                CreateTimer(5.0, Timer_CheckPlayerDelayed, GetClientUserId(i));
            }
        }
    }
    
    // Start the periodic check timer
    CreateTimer(g_cvCheckInterval.FloatValue, Timer_PeriodicCheck, _, TIMER_REPEAT);
    
    // Log plugin start
    LogMessage("[Mireda] Plugin loaded successfully. Server name: %s", g_sServerName);
}

public Action Event_PlayerConnect(Event event, const char[] name, bool dontBroadcast) {
    return Plugin_Continue;
}

public void OnClientAuthorized(int client, const char[] auth) {
    // Skip bots
    if (IsFakeClient(client))
        return;
    
    // Get the player's SteamID in STEAM_X:Y:Z format
    char steamId[32];
    if (!GetClientAuthId(client, AuthId_Steam2, steamId, sizeof(steamId))) {
        LogError("[Mireda] Failed to get SteamID for client %d", client);
        return;
    }
    
    // Check if admins are allowed to bypass
    if (g_cvAllowAdmins.BoolValue && CheckCommandAccess(client, "sm_admin", ADMFLAG_GENERIC)) {
        if (g_bDebugMode) {
            LogMessage("[Mireda] Admin %N (%s) bypassed allowlist check", client, steamId);
        }
        return;
    }
    
    // Queue a delayed check to make sure the player is fully connected
    CreateTimer(1.0, Timer_CheckPlayerDelayed, GetClientUserId(client));
}

public Action Timer_CheckPlayerDelayed(Handle timer, any userId) {
    int client = GetClientOfUserId(userId);
    
    // Client may have disconnected while waiting
    if (client <= 0)
        return Plugin_Stop;
    
    // Get the player's SteamID in STEAM_X:Y:Z format
    char steamId[32];
    if (!GetClientAuthId(client, AuthId_Steam2, steamId, sizeof(steamId))) {
        LogError("[Mireda] Failed to get SteamID for client %d", client);
        return Plugin_Stop;
    }
    
    // Perform the check
    CheckPlayerAccess(client, steamId);
    
    return Plugin_Stop;
}

void CheckPlayerAccess(int client, const char[] steamId) {
    // Build API URL
    char apiUrl[256], encodedServerName[256], encodedSteamId[128];
    g_cvApiUrl.GetString(apiUrl, sizeof(apiUrl));
    g_cvServerName.GetString(g_sServerName, sizeof(g_sServerName)); // Re-fetch server name to ensure it's current
    
    // URL encode server name and SteamID
    System2_URLEncode(encodedServerName, sizeof(encodedServerName), g_sServerName);
    System2_URLEncode(encodedSteamId, sizeof(encodedSteamId), steamId);
    
    // Construct final URL
    char url[512];
    Format(url, sizeof(url), "%s/%s/%s", apiUrl, encodedServerName, encodedSteamId);
    
    // Log more details in debug mode
    if (g_bDebugMode) {
        char clientName[64];
        GetClientName(client, clientName, sizeof(clientName));
        LogMessage("[Mireda] Checking access for %s (%s) via URL: %s", clientName, steamId, url);
        LogMessage("[Mireda] Server name: '%s', Encoded server name: '%s'", g_sServerName, encodedServerName);
    }
    
    // Create and send the HTTP request using System2 API
    System2HTTPRequest httpRequest = new System2HTTPRequest(OnAccessCheckResponse, url);
    httpRequest.Any = client; // Store client index in request's Any property
    httpRequest.Timeout = 10; // Set timeout to 10 seconds
    httpRequest.GET();
}

public void OnAccessCheckResponse(bool success, const char[] error, System2HTTPRequest request, System2HTTPResponse response, HTTPRequestMethod method) {
    // Get client from the request's Any property
    int client = request.Any;
    
    // Check if client is still connected
    if (client <= 0 || !IsClientConnected(client))
        return;
    
    // Get client info for logging
    char clientName[64], steamId[32];
    GetClientName(client, clientName, sizeof(clientName));
    GetClientAuthId(client, AuthId_Steam2, steamId, sizeof(steamId));
    
    // More detailed debug logging
    if (g_bDebugMode) {
        LogMessage("[Mireda] Access check response for %s (%s):", clientName, steamId);
        LogMessage("- Success: %d", success);
        LogMessage("- Status Code: %d", response ? response.StatusCode : 0);
        
        if (!success) {
            LogMessage("- Error: %s", error);
        }
        
        if (response) {
            char responseContent[4096];
            response.GetContent(responseContent, sizeof(responseContent));
            LogMessage("- Response Content: %s", responseContent);
        }
    }
    
    // Check for request errors
    if (!success || !response || response.StatusCode != 200) {
        LogError("[Mireda] API request failed for client %N (%s): %s (Status: %d)", 
            client, steamId, error, response ? response.StatusCode : 0);
        
        // Decide what to do based on fail_open setting
        if (g_cvFailOpen.BoolValue) {
            // Allow the player to stay if the API is down (fail open)
            if (g_bDebugMode) {
                LogMessage("[Mireda] API unreachable, allowing player %N to stay (fail-open mode)", client);
            }
            return;
        } else {
            // Kick the player if API is down and we're configured to fail closed
            if (g_bDebugMode) {
                LogMessage("[Mireda] API unreachable, kicking player %N (fail-closed mode)", client);
            }
            KickClient(client, "Access Manager API unreachable.");
            return;
        }
    }
    
    // Get the response content
    char responseContent[4096];
    response.GetContent(responseContent, sizeof(responseContent));
    
    if (g_bDebugMode) {
        LogMessage("[Mireda] Response content for %N: %s", client, responseContent);
    }
    
    // Parse the JSON response with better error handling
    bool allowed = false;
    char playerName[64] = "Unknown";
    char reason[128] = "Not on allowlist";
    
    // Try to parse the JSON
    JSON_Object json = json_decode(responseContent);
    if (json == null) {
        char error[256];
        json_get_last_error(error, sizeof(error));
        LogError("[Mireda] Failed to parse JSON response for client %N: %s", client, error);
        
        // Handle JSON parsing error based on fail_open setting
        if (g_cvFailOpen.BoolValue) {
            if (g_bDebugMode) {
                LogMessage("[Mireda] JSON parsing failed, allowing player %N to stay (fail-open mode)", client);
            }
            return;
        } else {
            if (g_bDebugMode) {
                LogMessage("[Mireda] JSON parsing failed, kicking player %N (fail-closed mode)", client);
            }
            KickClient(client, "Error processing access check.");
            return;
        }
    }
    
    // Extract data from JSON safely
    if (json.HasKey("allowed")) {
        allowed = json.GetBool("allowed");
    } else {
        LogError("[Mireda] JSON response for client %N missing 'allowed' field", client);
        allowed = g_cvFailOpen.BoolValue; // Use fail_open setting as default
    }
    
    if (json.HasKey("name")) {
        json.GetString("name", playerName, sizeof(playerName));
    }
    
    if (json.HasKey("reason")) {
        json.GetString("reason", reason, sizeof(reason));
    }
    
    // Clean up
    json_cleanup_and_delete(json);
    
    // If not allowed, kick the player
    if (!allowed) {
        LogMessage("[Mireda] Kicked unauthorized player: %s (%s) - Reason: %s", clientName, steamId, reason);
        KickClient(client, "Access Denied. (%s)", reason);
    } else if (g_bDebugMode) {
        LogMessage("[Mireda] Player %N is authorized (Name in database: %s)", client, playerName);
    }
}

public Action Command_TestServerName(int client, int args) {
    char serverName[128];
    g_cvServerName.GetString(serverName, sizeof(serverName));
    
    ReplyToCommand(client, "[Mireda] Current server name: '%s'", serverName);
    
    // Try to URL encode it
    char encodedName[256];
    System2_URLEncode(encodedName, sizeof(encodedName), serverName);
    
    ReplyToCommand(client, "[Mireda] URL-encoded server name: '%s'", encodedName);
    
    // Check if it exists in the database
    char apiUrl[256];
    g_cvApiUrl.GetString(apiUrl, sizeof(apiUrl));
    
    char testUrl[512];
    Format(testUrl, sizeof(testUrl), "%s/%s/test", apiUrl, encodedName);
    
    ReplyToCommand(client, "[Mireda] Testing API endpoint: %s", testUrl);
    
    // Create and send HTTP request
    System2HTTPRequest httpRequest = new System2HTTPRequest(OnServerNameTestResponse, testUrl);
    httpRequest.Any = GetClientUserId(client);
    httpRequest.Timeout = 5;
    httpRequest.GET();
    
    return Plugin_Handled;
}

public void OnServerNameTestResponse(bool success, const char[] error, System2HTTPRequest request, System2HTTPResponse response, HTTPRequestMethod method) {
    int client = GetClientOfUserId(view_as<int>(request.Any));
    
    if (client <= 0)
        return;
    
    if (!success || !response) {
        ReplyToCommand(client, "[Mireda] Server name test failed: %s", error);
        return;
    }
    
    char responseContent[4096];
    response.GetContent(responseContent, sizeof(responseContent));
    
    ReplyToCommand(client, "[Mireda] Server name test response: %s", responseContent);
}


public Action Timer_PeriodicCheck(Handle timer) {
    // Recheck all connected players periodically
    for (int i = 1; i <= MaxClients; i++) {
        if (IsClientConnected(i) && IsClientAuthorized(i) && !IsFakeClient(i)) {
            char steamId[32];
            if (GetClientAuthId(i, AuthId_Steam2, steamId, sizeof(steamId))) {
                // Don't recheck admins if they're allowed to bypass
                if (g_cvAllowAdmins.BoolValue && CheckCommandAccess(i, "sm_admin", ADMFLAG_GENERIC)) {
                    continue;
                }
                
                // Schedule the check with a small delay to spread out API calls
                float delay = (i % 5) * 2.0; // Spread checks over 10 seconds (0, 2, 4, 6, 8)
                CreateTimer(delay, Timer_CheckPlayerDelayed, GetClientUserId(i));
            }
        }
    }
    
    return Plugin_Continue;
}

public Action Command_ReloadAllowlist(int client, int args) {
    ReplyToCommand(client, "[Mireda] The allowlist is checked in real-time from the API. No reload needed.");
    return Plugin_Handled;
}

public Action Command_CheckPlayer(int client, int args) {
    if (args < 1) {
        ReplyToCommand(client, "Usage: sm_allowlist_check <player>");
        return Plugin_Handled;
    }
    
    char argTarget[64];
    GetCmdArg(1, argTarget, sizeof(argTarget));
    
    int target = FindTarget(client, argTarget, false, false);
    if (target == -1) {
        // FindTarget automatically replies with failure reason
        return Plugin_Handled;
    }
    
    char steamId[32];
    if (!GetClientAuthId(target, AuthId_Steam2, steamId, sizeof(steamId))) {
        ReplyToCommand(client, "[Mireda] Failed to get SteamID for target");
        return Plugin_Handled;
    }
    
    // Build API URL
    char apiUrl[256], encodedServerName[256], encodedSteamId[128];
    g_cvApiUrl.GetString(apiUrl, sizeof(apiUrl));
    
    // URL encode server name and SteamID
    System2_URLEncode(encodedServerName, sizeof(encodedServerName), g_sServerName);
    System2_URLEncode(encodedSteamId, sizeof(encodedSteamId), steamId);
    
    // Construct final URL
    char url[512];
    Format(url, sizeof(url), "%s/%s/%s", apiUrl, encodedServerName, encodedSteamId);
    
    ReplyToCommand(client, "[Mireda] Checking player %N (%s) against the allowlist...", target, steamId);
    
    // Store important IDs in a DataPack to pass to the callback
    DataPack pack = new DataPack();
    pack.WriteCell(GetClientUserId(client));
    pack.WriteCell(GetClientUserId(target));
    
    // Create and send the HTTP request using System2 API
    System2HTTPRequest httpRequest = new System2HTTPRequest(OnAdminCheckResponse, url);
    httpRequest.Any = pack; // Store the DataPack in the request's Any property
    httpRequest.Timeout = 10; // Set timeout to 10 seconds
    httpRequest.GET();
    
    return Plugin_Handled;
}

public Action Command_AllowlistStatus(int client, int args) {
    // Report status of the allowlist system
    ReplyToCommand(client, "[Mireda] Status Information:");
    
    char apiUrl[256];
    g_cvApiUrl.GetString(apiUrl, sizeof(apiUrl));
    ReplyToCommand(client, "- API URL: %s", apiUrl);
    ReplyToCommand(client, "- Server Name: %s", g_sServerName);
    ReplyToCommand(client, "- Check Interval: %.1f seconds", g_cvCheckInterval.FloatValue);
    ReplyToCommand(client, "- Allow Admins: %s", g_cvAllowAdmins.BoolValue ? "Yes" : "No");
    ReplyToCommand(client, "- Fail Open Mode: %s", g_cvFailOpen.BoolValue ? "Yes (allow when API unreachable)" : "No (deny when API unreachable)");
    ReplyToCommand(client, "- Debug Mode: %s", g_bDebugMode ? "Enabled" : "Disabled");
    
    // Perform a quick ping test to the API
    char pingUrl[512], encodedServerName[256];
    System2_URLEncode(encodedServerName, sizeof(encodedServerName), g_sServerName);
    Format(pingUrl, sizeof(pingUrl), "%s/%s/ping", apiUrl, encodedServerName);
    
    ReplyToCommand(client, "Checking API connectivity...");
    
    // Create and send the HTTP request
    System2HTTPRequest httpRequest = new System2HTTPRequest(OnStatusCheckResponse, pingUrl);
    httpRequest.Any = GetClientUserId(client); // Store client UserID
    httpRequest.Timeout = 5; // Short timeout for status check
    httpRequest.GET();
    
    return Plugin_Handled;
}

public void OnStatusCheckResponse(bool success, const char[] error, System2HTTPRequest request, System2HTTPResponse response, HTTPRequestMethod method) {
    int client = GetClientOfUserId(view_as<int>(request.Any));
    
    if (client <= 0) // Client disconnected
        return;
    
    if (!success || !response || response.StatusCode != 200) {
        ReplyToCommand(client, "[Mireda] API Connection Test: FAILED");
        ReplyToCommand(client, "Error: %s (Status: %d)", 
            error, response ? response.StatusCode : 0);
        return;
    }
    
    char responseContent[512];
    response.GetContent(responseContent, sizeof(responseContent));
    
    // Try to parse the JSON response
    JSON_Object json = json_decode(responseContent);
    if (json == null) {
        char jsonError[256];
        json_get_last_error(jsonError, sizeof(jsonError));
        ReplyToCommand(client, "[Mireda] API Connection Test: SUCCESS (Invalid response format)");
        ReplyToCommand(client, "API returned invalid JSON: %s", jsonError);
        return;
    }
    
    // Check for status field
    char status[64] = "unknown";
    if (json.HasKey("status")) {
        json.GetString("status", status, sizeof(status));
    }
    
    // Get API version if available
    char version[32] = "unknown";
    if (json.HasKey("version")) {
        json.GetString("version", version, sizeof(version));
    }
    
    // Clean up
    json_cleanup_and_delete(json);
    
    ReplyToCommand(client, "[Mireda] API Connection Test: SUCCESS");
    ReplyToCommand(client, "API Status: %s", status);
    ReplyToCommand(client, "API Version: %s", version);
    
    // Count players currently on server
    int playerCount = 0;
    int allowedAdmins = 0;
    
    for (int i = 1; i <= MaxClients; i++) {
        if (IsClientConnected(i) && !IsFakeClient(i)) {
            playerCount++;
            if (g_cvAllowAdmins.BoolValue && CheckCommandAccess(i, "sm_admin", ADMFLAG_GENERIC)) {
                allowedAdmins++;
            }
        }
    }
    
    ReplyToCommand(client, "Current Players: %d total, %d admins with bypass", playerCount, allowedAdmins);
}

public void OnAdminCheckResponse(bool success, const char[] error, System2HTTPRequest request, System2HTTPResponse response, HTTPRequestMethod method) {
    // Get the DataPack from the request's Any property
    DataPack pack = view_as<DataPack>(request.Any);
    pack.Reset();
    
    int clientId = pack.ReadCell();
    int targetId = pack.ReadCell();
    
    // Clean up the DataPack
    delete pack;
    
    int client = GetClientOfUserId(clientId);
    int target = GetClientOfUserId(targetId);
    
    // Check if the admin is still connected
    if (client <= 0)
        return;
    
    // Target might have disconnected
    char targetName[64] = "Unknown";
    char steamId[32] = "Unknown";
    
    if (target > 0) {
        GetClientName(target, targetName, sizeof(targetName));
        GetClientAuthId(target, AuthId_Steam2, steamId, sizeof(steamId));
    }
    
    // Check for request errors
    if (!success || !response || response.StatusCode != 200) {
        ReplyToCommand(client, "[Mireda] API request failed: %s (Status: %d)", 
            error, response ? response.StatusCode : 0);
        return;
    }
    
    // Get the response content
    char responseContent[4096];
    response.GetContent(responseContent, sizeof(responseContent));
    
    // Parse the JSON response with proper error handling
    JSON_Object json = json_decode(responseContent);
    if (json == null) {
        char jsonError[256];
        json_get_last_error(jsonError, sizeof(jsonError));
        ReplyToCommand(client, "[Mireda] Failed to parse JSON response: %s", jsonError);
        return;
    }
    
    // Extract data safely
    bool allowed = false;
    char name[64] = "Unknown";
    
    if (json.HasKey("allowed")) {
        allowed = json.GetBool("allowed");
    } else {
        ReplyToCommand(client, "[Mireda] JSON response missing 'allowed' field");
    }
    
    if (json.HasKey("name")) {
        json.GetString("name", name, sizeof(name));
    }
    
    // Clean up
    json_cleanup_and_delete(json);
    
    // Reply with the result
    if (allowed) {
        ReplyToCommand(client, "[Mireda] Player %s (%s) is on the allowlist. Name in database: %s", 
            targetName, steamId, name);
    } else {
        ReplyToCommand(client, "[Mireda] Player %s (%s) is NOT on the allowlist!", 
            targetName, steamId);
    }
}
