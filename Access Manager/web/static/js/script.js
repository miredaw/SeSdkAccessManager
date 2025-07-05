document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements - SteamID Management
    const serverDropdown = document.getElementById('server-dropdown');
    const serverPanel = document.getElementById('server-panel');
    const initialMessage = document.querySelector('.initial-message');
    const steamidManager = document.querySelector('.steamid-manager');
    const serverNameElem = document.getElementById('server-name');
    const steamidTable = document.getElementById('steamid-table');
    const steamidTbody = document.getElementById('steamid-tbody');
    const noSteamidsMessage = document.getElementById('no-steamids-message');
    const addSteamidBtn = document.getElementById('add-steamid-btn');
    const viewServerDetailsBtn = document.getElementById('view-server-details');
    
    // DOM Elements - Tab Management
    const manageTab = document.getElementById('manage-tab');
    const serversTab = document.getElementById('servers-tab');
    const manageContent = document.getElementById('manage-content');
    const serversContent = document.getElementById('servers-content');
    
    // DOM Elements - Server Management
    const serversTable = document.getElementById('servers-table');
    const serversTbody = document.getElementById('servers-tbody');
    const noServersMessage = document.getElementById('no-servers-message');
    const addServerBtn = document.getElementById('add-server-btn');
    
    // Modal Elements - SteamID Management
    const steamidModal = document.getElementById('steamid-modal');
    const confirmModal = document.getElementById('confirm-modal');
    const modalTitle = document.getElementById('modal-title');
    const steamidForm = document.getElementById('steamid-form');
    const playerNameInput = document.getElementById('player-name');
    const steamidInput = document.getElementById('steamid-input');
    const editModeInput = document.getElementById('edit-mode');
    const originalSteamidInput = document.getElementById('original-steamid');
    const deleteName = document.getElementById('delete-name');
    const deleteSteamid = document.getElementById('delete-steamid');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    
    // Modal Elements - Server Management
    const serverModal = document.getElementById('server-modal');
    const serverModalTitle = document.getElementById('server-modal-title');
    const serverForm = document.getElementById('server-form');
    const serverNameInput = document.getElementById('server-name-input');
    const serverIpInput = document.getElementById('server-ip');
    const serverPortInput = document.getElementById('server-port');
    const serverRconInput = document.getElementById('server-rcon');
    const serverEditModeInput = document.getElementById('server-edit-mode');
    const originalServerNameInput = document.getElementById('original-server-name');
    
    // Modal Elements - Server Details
    const serverDetailsModal = document.getElementById('server-details-modal');
    const detailServerName = document.getElementById('detail-server-name');
    const detailServerIp = document.getElementById('detail-server-ip');
    const detailServerPort = document.getElementById('detail-server-port');
    const detailServerRcon = document.getElementById('detail-server-rcon');
    const showRconBtn = document.getElementById('show-rcon-btn');
    const connectCommand = document.getElementById('connect-command');
    const copyConnectCmd = document.getElementById('copy-connect-cmd');
    const editServerDetailsBtn = document.getElementById('edit-server-details-btn');
    
    // Current selected server
    let currentServer = '';
    let currentServerData = {};
    
    // Event Listeners - Tab Management
    manageTab.addEventListener('click', () => switchTab('manage'));
    serversTab.addEventListener('click', () => switchTab('servers'));
    
    // Event Listeners - SteamID Management
    serverDropdown.addEventListener('change', handleServerChange);
    addSteamidBtn.addEventListener('click', showAddSteamidModal);
    steamidForm.addEventListener('submit', handleSteamidFormSubmit);
    viewServerDetailsBtn.addEventListener('click', showServerDetailsModal);
    
    // Event Listeners - Server Management
    addServerBtn.addEventListener('click', showAddServerModal);
    serverForm.addEventListener('submit', handleServerFormSubmit);
    
    // Event Listeners - Server Details
    if (showRconBtn) {
        showRconBtn.addEventListener('click', toggleRconVisibility);
    }
    copyConnectCmd.addEventListener('click', copyConnectCommand);
    editServerDetailsBtn.addEventListener('click', editCurrentServer);
    
    // Event Listeners - Common
    // Use event delegation for modal close buttons
    document.addEventListener('click', function(event) {
        // Check if the clicked element is a close button
        if (event.target.classList.contains('close-modal') || 
            event.target.classList.contains('close-btn') ||
            event.target.parentElement.classList.contains('close-modal')) {
            closeAllModals();
        }
    });
    
    confirmDeleteBtn.addEventListener('click', handleDelete);
    
    // Initialize
    loadServers();
    
    // Tab Functions
    function switchTab(tab) {
        if (tab === 'manage') {
            manageTab.classList.add('active');
            serversTab.classList.remove('active');
            manageContent.classList.add('active');
            serversContent.classList.remove('active');
        } else {
            manageTab.classList.remove('active');
            serversTab.classList.add('active');
            manageContent.classList.remove('active');
            serversContent.classList.add('active');
            loadServers(); // Refresh server list
        }
    }
    
    // SteamID Management Functions
    function handleServerChange() {
        const selectedServer = serverDropdown.value;
        
        if (!selectedServer) {
            initialMessage.classList.remove('hidden');
            steamidManager.classList.add('hidden');
            return;
        }
        
        currentServer = selectedServer;
        serverNameElem.textContent = selectedServer;
        
        initialMessage.classList.add('hidden');
        steamidManager.classList.remove('hidden');
        
        fetchServerData(selectedServer);
    }
    
    function fetchServerData(serverName) {
        fetch(`/api/server/${encodeURIComponent(serverName)}`)
            .then(response => response.json())
            .then(data => {
                currentServerData = data;
                populateSteamIDTable(data.steamids);
            })
            .catch(error => {
                console.error('Error fetching server data:', error);
                showNotification('Error loading server data', 'error');
            });
    }
    
    function populateSteamIDTable(steamids) {
        steamidTbody.innerHTML = '';
        
        if (!steamids || Object.keys(steamids).length === 0) {
            steamidTable.classList.add('hidden');
            noSteamidsMessage.classList.remove('hidden');
            return;
        }
        
        steamidTable.classList.remove('hidden');
        noSteamidsMessage.classList.add('hidden');
        
        Object.entries(steamids).forEach(([steamid, name]) => {
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td>${name}</td>
                <td>${steamid}</td>
                <td class="action-buttons">
                    <button class="action-btn edit-btn" data-steamid="${steamid}" data-name="${name}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-btn" data-steamid="${steamid}" data-name="${name}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            
            // Add event listeners to action buttons
            row.querySelector('.edit-btn').addEventListener('click', (e) => {
                const steamid = e.currentTarget.dataset.steamid;
                const name = e.currentTarget.dataset.name;
                showEditSteamidModal(steamid, name);
            });
            
            row.querySelector('.delete-btn').addEventListener('click', (e) => {
                const steamid = e.currentTarget.dataset.steamid;
                const name = e.currentTarget.dataset.name;
                showDeleteConfirmation('steamid', steamid, name);
            });
            
            steamidTbody.appendChild(row);
        });
    }
    
    function showAddSteamidModal() {
        modalTitle.textContent = 'Add Steam ID';
        playerNameInput.value = '';
        steamidInput.value = '';
        editModeInput.value = 'add';
        originalSteamidInput.value = '';
        steamidInput.disabled = false;
        
        steamidModal.style.display = 'flex';
    }
    
    function showEditSteamidModal(steamid, name) {
        modalTitle.textContent = 'Edit Steam ID';
        playerNameInput.value = name;
        steamidInput.value = steamid;
        editModeInput.value = 'edit';
        originalSteamidInput.value = steamid;
        steamidInput.disabled = true;
        
        steamidModal.style.display = 'flex';
    }
    
    function handleSteamidFormSubmit(e) {
        e.preventDefault();
        
        const name = playerNameInput.value.trim();
        const steamid = steamidInput.value.trim();
        const mode = editModeInput.value;
        const originalSteamid = originalSteamidInput.value;
        
        if (!name || !steamid) return;
        
        // Validate Steam ID format (STEAM_0:X:XXXXXXXX)
        const steamIdRegex = /^STEAM_0:[01]:\d+$/;
        if (!steamIdRegex.test(steamid)) {
            showNotification('Please enter a valid Steam ID in the format STEAM_0:X:XXXXXXXX', 'error');
            return;
        }
        
        if (mode === 'add') {
            addSteamID(currentServer, steamid, name);
        } else {
            editSteamID(currentServer, originalSteamid, name);
        }
    }
    
    function addSteamID(server, steamid, name) {
        fetch(`/api/server/${encodeURIComponent(server)}/steamid`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ steamid, name })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeAllModals();
                fetchServerData(server);
                showNotification(`Added ${name} successfully`, 'success');
            } else {
                showNotification(data.error || 'Failed to add Steam ID', 'error');
            }
        })
        .catch(error => {
            console.error('Error adding Steam ID:', error);
            showNotification('Error adding Steam ID', 'error');
        });
    }
    
    function editSteamID(server, steamid, name) {
        fetch(`/api/server/${encodeURIComponent(server)}/steamid/${encodeURIComponent(steamid)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeAllModals();
                fetchServerData(server);
                showNotification(`Updated ${name} successfully`, 'success');
            } else {
                showNotification(data.error || 'Failed to update Steam ID', 'error');
            }
        })
        .catch(error => {
            console.error('Error updating Steam ID:', error);
            showNotification('Error updating Steam ID', 'error');
        });
    }
    
    // Server Management Functions
    function loadServers() {
        fetch('/api/servers')
            .then(response => response.json())
            .then(servers => {
                populateServersTable(servers);
                updateServerDropdown(servers);
            })
            .catch(error => {
                console.error('Error loading servers:', error);
                showNotification('Error loading server list', 'error');
            });
    }
    
    function populateServersTable(servers) {
        serversTbody.innerHTML = '';
        
        if (!servers || servers.length === 0) {
            serversTable.classList.add('hidden');
            noServersMessage.classList.remove('hidden');
            return;
        }
        
        serversTable.classList.remove('hidden');
        noServersMessage.classList.add('hidden');
        
        servers.forEach(server => {
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td>${server.name}</td>
                <td>${server.ip || '-'}</td>
                <td>${server.port || '-'}</td>
                <td>${server.steamid_count || 0}</td>
                <td class="action-buttons">
                    <button class="action-btn view-btn" data-server="${server.name}">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="action-btn edit-btn" data-server="${server.name}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-btn" data-server="${server.name}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            
            // Add event listeners to action buttons
            row.querySelector('.view-btn').addEventListener('click', (e) => {
                const serverName = e.currentTarget.dataset.server;
                showServerDetails(serverName);
            });
            
            row.querySelector('.edit-btn').addEventListener('click', (e) => {
                const serverName = e.currentTarget.dataset.server;
                showEditServerModal(serverName);
            });
            
            row.querySelector('.delete-btn').addEventListener('click', (e) => {
                const serverName = e.currentTarget.dataset.server;
                showDeleteConfirmation('server', serverName);
            });
            
            serversTbody.appendChild(row);
        });
    }
    
    function updateServerDropdown(servers) {
        // Save current selection
        const currentSelection = serverDropdown.value;
        
        // Clear dropdown except first option
        while (serverDropdown.options.length > 1) {
            serverDropdown.remove(1);
        }
        
        // Add server options
        servers.forEach(server => {
            const option = document.createElement('option');
            option.value = server.name;
            option.textContent = server.name;
            serverDropdown.appendChild(option);
        });
        
        // Restore selection if possible
        if (currentSelection && Array.from(serverDropdown.options).some(opt => opt.value === currentSelection)) {
            serverDropdown.value = currentSelection;
        }
    }
    
    function showAddServerModal() {
        serverModalTitle.textContent = 'Add Server';
        serverNameInput.value = '';
        serverIpInput.value = '';
        serverPortInput.value = '';
        if (serverRconInput) serverRconInput.value = '';
        serverEditModeInput.value = 'add';
        originalServerNameInput.value = '';
        serverNameInput.disabled = false;
        
        serverModal.style.display = 'flex';
    }
    
    function showEditServerModal(serverName) {
        fetch(`/api/server/${encodeURIComponent(serverName)}`)
            .then(response => response.json())
            .then(server => {
                serverModalTitle.textContent = 'Edit Server';
                serverNameInput.value = serverName;
                serverIpInput.value = server.ip || '';
                serverPortInput.value = server.port || '';
                if (serverRconInput) serverRconInput.value = ''; // Don't prefill password
                serverEditModeInput.value = 'edit';
                originalServerNameInput.value = serverName;
                serverNameInput.disabled = false; // Allow editing name
                
                serverModal.style.display = 'flex';
            })
            .catch(error => {
                console.error('Error fetching server details:', error);
                showNotification('Error loading server details', 'error');
            });
    }
    
    function handleServerFormSubmit(e) {
        e.preventDefault();
        
        const name = serverNameInput.value.trim();
        const ip = serverIpInput.value.trim();
        const port = serverPortInput.value.trim();
        const rcon = serverRconInput ? serverRconInput.value : '';
        const mode = serverEditModeInput.value;
        const originalName = originalServerNameInput.value;
        
        if (!name) {
            showNotification('Server name is required', 'error');
            return;
        }
        
        if (mode === 'add') {
            addServer(name, ip, port, rcon);
        } else {
            updateServer(originalName, name, ip, port, rcon);
        }
    }
    
    function addServer(name, ip, port, rcon) {
        fetch('/api/server', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, ip, port, rcon })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeAllModals();
                loadServers();
                showNotification(`Server "${name}" added successfully`, 'success');
            } else {
                showNotification(data.error || 'Failed to add server', 'error');
            }
        })
        .catch(error => {
            console.error('Error adding server:', error);
            showNotification('Error adding server', 'error');
        });
    }
    
    function updateServer(originalName, newName, ip, port, rcon) {
        const data = { name: newName, ip, port };
        
        // Only include rcon if it was changed
        if (rcon) {
            data.rcon = rcon;
        }
        
        fetch(`/api/server/${encodeURIComponent(originalName)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeAllModals();
                loadServers();
                
                // If currently viewing this server, update it
                if (currentServer === originalName) {
                    currentServer = newName;
                    serverNameElem.textContent = newName;
                    fetchServerData(newName);
                }
                
                showNotification(`Server "${newName}" updated successfully`, 'success');
            } else {
                showNotification(data.error || 'Failed to update server', 'error');
            }
        })
        .catch(error => {
            console.error('Error updating server:', error);
            showNotification('Error updating server', 'error');
        });
    }
    
    function deleteServer(serverName) {
        fetch(`/api/server/${encodeURIComponent(serverName)}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loadServers();
                
                // If currently viewing this server, reset view
                if (currentServer === serverName) {
                    currentServer = '';
                    serverDropdown.value = '';
                    initialMessage.classList.remove('hidden');
                    steamidManager.classList.add('hidden');
                }
                
                showNotification(`Server "${serverName}" deleted successfully`, 'success');
            } else {
                showNotification(data.error || 'Failed to delete server', 'error');
            }
        })
        .catch(error => {
            console.error('Error deleting server:', error);
            showNotification('Error deleting server', 'error');
        });
    }
    
    // Server Details Functions
    function showServerDetails(serverName) {
        fetch(`/api/server/${encodeURIComponent(serverName)}`)
            .then(response => response.json())
            .then(server => {
                detailServerName.textContent = serverName;
                detailServerIp.textContent = server.ip || 'Not specified';
                detailServerPort.textContent = server.port || 'Not specified';
                if (detailServerRcon) {
                    detailServerRcon.textContent = '********';
                    detailServerRcon.dataset.rcon = server.rcon || '';
                }
                
                // Update connect command
                if (server.ip && server.port) {
                    connectCommand.textContent = `connect ${server.ip}:${server.port}`;
                } else if (server.ip) {
                    connectCommand.textContent = `connect ${server.ip}`;
                } else {
                    connectCommand.textContent = 'Server IP not configured';
                }
                
                serverDetailsModal.style.display = 'flex';
            })
            .catch(error => {
                console.error('Error fetching server details:', error);
                showNotification('Error loading server details', 'error');
            });
    }
    
    function showServerDetailsModal() {
        if (!currentServer || !currentServerData) return;
        
        detailServerName.textContent = currentServer;
        detailServerIp.textContent = currentServerData.ip || 'Not specified';
        detailServerPort.textContent = currentServerData.port || 'Not specified';
        if (detailServerRcon) {
            detailServerRcon.textContent = '********';
            detailServerRcon.dataset.rcon = currentServerData.rcon || '';
        }
        
        // Update connect command
        if (currentServerData.ip && currentServerData.port) {
            connectCommand.textContent = `connect ${currentServerData.ip}:${currentServerData.port}`;
        } else if (currentServerData.ip) {
            connectCommand.textContent = `connect ${currentServerData.ip}`;
        } else {
            connectCommand.textContent = 'Server IP not configured';
        }
        
        serverDetailsModal.style.display = 'flex';
    }
    
    function toggleRconVisibility() {
        if (!detailServerRcon) return;
        
        const rcon = detailServerRcon.dataset.rcon || '';
        
        if (detailServerRcon.textContent === '********') {
            detailServerRcon.textContent = rcon || 'Not set';
            showRconBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            detailServerRcon.textContent = '********';
            showRconBtn.innerHTML = '<i class="fas fa-eye"></i>';
        }
    }
    
    function copyConnectCommand() {
        const command = connectCommand.textContent;
        navigator.clipboard.writeText(command)
            .then(() => {
                showNotification('Connect command copied to clipboard', 'success');
            })
            .catch(err => {
                showNotification('Failed to copy to clipboard', 'error');
            });
    }
    
    function editCurrentServer() {
        showEditServerModal(currentServer);
        serverDetailsModal.style.display = 'none';
    }
    
    // Deletion Functions
    function showDeleteConfirmation(type, id, name) {
        if (type === 'steamid') {
            confirmMessage.innerHTML = `Are you sure you want to remove <span id="delete-name">${name}</span> (<span id="delete-steamid">${id}</span>) from the allowed list?`;
            confirmDeleteBtn.dataset.type = 'steamid';
            confirmDeleteBtn.dataset.id = id;
        } else {
            confirmMessage.innerHTML = `Are you sure you want to delete the server <strong>${id}</strong>? This will remove all associated Steam IDs and cannot be undone.`;
            confirmDeleteBtn.dataset.type = 'server';
            confirmDeleteBtn.dataset.id = id;
        }
        
        confirmModal.style.display = 'flex';
    }
    
    function handleDelete() {
        const type = confirmDeleteBtn.dataset.type;
        const id = confirmDeleteBtn.dataset.id;
        
        if (type === 'steamid') {
            deleteSteamID(currentServer, id);
        } else if (type === 'server') {
            deleteServer(id);
        }
        
        closeAllModals();
    }
    
    function deleteSteamID(server, steamid) {
        fetch(`/api/server/${encodeURIComponent(server)}/steamid/${encodeURIComponent(steamid)}`, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                fetchServerData(server);
                showNotification('Steam ID removed successfully', 'success');
            } else {
                showNotification(data.error || 'Failed to remove Steam ID', 'error');
            }
        })
        .catch(error => {
            console.error('Error deleting Steam ID:', error);
            showNotification('Error removing Steam ID', 'error');
        });
    }
    
    // Common Functions
    function closeAllModals() {
        // Hide all modals
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.style.display = 'none';
        });
    }
    
    // Create a notification system
    function showNotification(message, type = 'info') {
        // Check if notification container exists, if not create it
        let notificationContainer = document.querySelector('.notification-container');
        
        if (!notificationContainer) {
            notificationContainer = document.createElement('div');
            notificationContainer.className = 'notification-container';
            document.body.appendChild(notificationContainer);
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Add close button
        const closeBtn = document.createElement('span');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.marginLeft = '10px';
        closeBtn.style.fontWeight = 'bold';
        closeBtn.style.fontSize = '1.2rem';
        
        closeBtn.addEventListener('click', () => {
            notification.remove();
        });
        
        notification.appendChild(closeBtn);
        
        // Add to container
        notificationContainer.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
});