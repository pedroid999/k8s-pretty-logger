// Initialize Socket.IO
const socket = io();
console.log("Vue app socket initialized");

// For debugging
let logsReceived = 0;

// Create Vue app
const app = Vue.createApp({
    data() {
        return {
            // K8s data
            contexts: [],
            namespaces: [],
            pods: [],
            selectedContext: '',
            selectedNamespace: 'default',
            selectedPod: null,
            selectedContainer: null,
            
            // Logs
            logs: [],
            logFilter: '',
            logStreaming: false,
            autoScroll: true,
            maxLogEntries: 5000, // Limit to prevent memory issues
            
            // UI state
            loading: {
                contexts: false,
                setContext: false,
                namespaces: false,
                pods: false
            },
            errors: {
                contexts: null,
                namespaces: null,
                pods: null,
                logs: null
            }
        };
    },
    
    computed: {
        filteredLogs() {
            if (!this.logFilter) {
                return this.logs;
            }
            
            return this.logs.filter(log => 
                log.message.includes(this.logFilter)
            );
        }
    },
    
    watch: {
        // Auto-scroll to the bottom of logs when new entries are added
        logs() {
            if (this.autoScroll) {
                this.$nextTick(() => {
                    this.scrollToBottom();
                });
            }
        },
        
        // When pod selection changes, select first container by default
        selectedPod(newPod) {
            if (newPod && newPod.containers && newPod.containers.length > 0) {
                this.selectedContainer = newPod.containers[0].name;
                
                // Auto-start log streaming when a pod is selected
                this.startLogStream();
            } else {
                this.selectedContainer = null;
                this.stopLogStream();
            }
        }
    },
    
    methods: {
        // Fetch available K8s contexts
        async loadContexts() {
            this.loading.contexts = true;
            this.errors.contexts = null;
            
            try {
                const response = await fetch('/api/contexts');
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                
                const data = await response.json();
                this.contexts = data;
                
                // Find and select active context
                const activeContext = this.contexts.find(ctx => ctx.active);
                if (activeContext) {
                    this.selectedContext = activeContext.name;
                } else if (this.contexts.length > 0) {
                    this.selectedContext = this.contexts[0].name;
                }
                
                // Continue loading namespaces after contexts are loaded
                this.loadNamespaces();
            } catch (error) {
                console.error('Error loading contexts:', error);
                this.errors.contexts = `Failed to load contexts: ${error.message}`;
            } finally {
                this.loading.contexts = false;
            }
        },
        
        // Set the current K8s context
        async setContext() {
            if (!this.selectedContext) return;
            
            this.loading.setContext = true;
            this.errors.contexts = null;
            
            try {
                const response = await fetch('/api/context', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ context: this.selectedContext })
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `HTTP error ${response.status}`);
                }
                
                // Reload namespaces and pods with the new context
                await this.loadNamespaces();
                
                // Clear selected pod when context changes
                this.selectedPod = null;
                this.logs = [];
            } catch (error) {
                console.error('Error setting context:', error);
                this.errors.contexts = `Failed to set context: ${error.message}`;
            } finally {
                this.loading.setContext = false;
            }
        },
        
        // Fetch available namespaces
        async loadNamespaces() {
            this.loading.namespaces = true;
            this.errors.namespaces = null;
            
            try {
                const response = await fetch('/api/namespaces');
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                
                const data = await response.json();
                this.namespaces = data;
                
                // Set default namespace if it exists
                if (this.namespaces.some(ns => ns.name === 'default')) {
                    this.selectedNamespace = 'default';
                } else if (this.namespaces.length > 0) {
                    this.selectedNamespace = this.namespaces[0].name;
                }
                
                // Load pods for the selected namespace
                this.loadPods();
            } catch (error) {
                console.error('Error loading namespaces:', error);
                this.errors.namespaces = `Failed to load namespaces: ${error.message}`;
            } finally {
                this.loading.namespaces = false;
            }
        },
        
        // Fetch pods in the selected namespace
        async loadPods() {
            if (!this.selectedNamespace) return;
            
            this.loading.pods = true;
            this.errors.pods = null;
            
            try {
                const response = await fetch(`/api/pods?namespace=${this.selectedNamespace}`);
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}`);
                }
                
                const data = await response.json();
                this.pods = data;
                
                // Clear selected pod when namespace changes
                this.selectedPod = null;
                this.logs = [];
            } catch (error) {
                console.error('Error loading pods:', error);
                this.errors.pods = `Failed to load pods: ${error.message}`;
            } finally {
                this.loading.pods = false;
            }
        },
        
        // Select a pod to view logs
        selectPod(pod) {
            this.selectedPod = pod;
        },
        
        // Start streaming logs for the selected pod
        startLogStream() {
            if (!this.selectedPod || !this.selectedNamespace) return;
            
            // Clean up any existing log stream
            this.stopLogStream();
            
            // Start new log stream
            socket.emit('start_logs', {
                namespace: this.selectedNamespace,
                pod: this.selectedPod.name,
                container: this.selectedContainer,
                tail_lines: 100
            });
            
            this.logStreaming = true;
        },
        
        // Stop log streaming
        stopLogStream() {
            if (this.selectedPod) {
                socket.emit('stop_logs', {
                    pod: this.selectedPod.name
                });
            }
            
            this.logStreaming = false;
        },
        
        // Toggle log streaming state
        toggleLogStream() {
            if (this.logStreaming) {
                this.stopLogStream();
            } else {
                this.startLogStream();
            }
        },
        
        // Clear logs display
        clearLogs() {
            this.logs = [];
        },
        
        // Toggle auto-scroll behavior
        toggleAutoScroll() {
            this.autoScroll = !this.autoScroll;
            if (this.autoScroll) {
                this.scrollToBottom();
            }
        },
        
        // Scroll to the bottom of the log view
        scrollToBottom() {
            const logView = this.$refs.logView;
            if (logView) {
                logView.scrollTop = logView.scrollHeight;
            }
        },
        
        // Format log timestamp for display
        formatTimestamp(timestamp) {
            if (!timestamp) return '';
            
            // Try to parse the timestamp (format: 2025-05-13T18:18:51.902Z)
            try {
                const date = new Date(timestamp);
                if (isNaN(date.getTime())) {
                    return timestamp; // If parsing fails, return the original string
                }
                
                // Format: HH:MM:SS.mmm
                const hours = date.getHours().toString().padStart(2, '0');
                const minutes = date.getMinutes().toString().padStart(2, '0');
                const seconds = date.getSeconds().toString().padStart(2, '0');
                const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
                
                return `${hours}:${minutes}:${seconds}.${milliseconds}`;
            } catch (e) {
                console.error("Error formatting timestamp:", e);
                return timestamp;
            }
        },
        
        // Get CSS class for pod status
        getPodStatusClass(status) {
            status = status.toLowerCase();
            if (status === 'running') return 'status-running';
            if (status === 'pending') return 'status-pending';
            if (status === 'failed') return 'status-failed';
            if (status === 'succeeded') return 'status-running';
            if (status.includes('termin')) return 'status-terminated';
            if (status.includes('wait')) return 'status-waiting';
            return 'status-unknown';
        },
        
        // Get CSS class for container status
        getContainerStatusClass(status) {
            status = status.toLowerCase();
            if (status === 'running' || status.includes('true')) return 'status-running';
            if (status.includes('wait')) return 'status-waiting';
            if (status.includes('termin') || status.includes('fail')) return 'status-terminated';
            return 'status-unknown';
        },
        
        // Format log message for better readability
        formatLogMessage(message) {
            if (!message) return '';
            
            // Try to parse Spring Boot log format
            // Example: c.v.t.g.m.SendMessageToTopicService : Message content
            try {
                // Find class name and message content
                const colonPos = message.indexOf(' : ');
                if (colonPos > 0) {
                    const className = message.substring(0, colonPos).trim();
                    const content = message.substring(colonPos + 3).trim();
                    
                    return `<span class="log-class">${this.escapeHtml(className)}</span><span class="colon-separator">:</span> ${this.escapeHtml(content)}`;
                }
                
                // Check if this is a JSON message
                if (message.trim().startsWith('{') && message.trim().endsWith('}')) {
                    try {
                        // Format JSON for better readability
                        const jsonObj = JSON.parse(message);
                        return `<pre>${this.escapeHtml(JSON.stringify(jsonObj, null, 2))}</pre>`;
                    } catch {
                        // Not valid JSON, return as is
                    }
                }
            } catch (e) {
                console.debug('Error formatting log message:', e);
            }
            
            // Default: return as is
            return this.escapeHtml(message);
        },
        
        // Escape HTML to prevent XSS
        escapeHtml(text) {
            if (!text) return '';
            return text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        },
        
        // Highlight filtered text in log messages
        highlightFilteredText(text) {
            if (!text) return '';
            
            // Truncate very long logs to improve performance (over 2000 chars)
            let displayText = text;
            if (text.length > 2000) {
                displayText = text.substring(0, 2000) + '... (truncated)';
            }
            
            // Format the log for better readability
            const formattedText = this.formatLogMessage(displayText);
            
            if (!this.logFilter) return formattedText;
            
            // Apply highlighting to the formatted text
            // Note: this is a simplistic approach and may not work perfectly with HTML formatting
            const escapedFilter = this.escapeRegExp(this.escapeHtml(this.logFilter));
            const regex = new RegExp(`(${escapedFilter})`, 'g');
            return formattedText.replace(regex, '<span class="highlight">$1</span>');
        },
        
        // Escape string for use in RegExp
        escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
    },
    
    // Vue lifecycle hook - when app is mounted
    mounted() {
        // Load initial data
        this.loadContexts();
        
        // Set up Socket.IO event listeners
        socket.on('connect', () => {
            console.log('Connected to server');
        });
        
        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.logStreaming = false;
        });
        
        socket.on('test_event', (data) => {
            console.log('Test event received:', data);
        });
        
        socket.on('error', (data) => {
            console.error('Socket error:', data);
            this.errors.logs = data.message;
            this.logStreaming = false;
        });
        
        socket.on('log_update', (data) => {
            // Add log entry to the logs array
            this.logs.push(data);
            
            // For debugging
            logsReceived++;
            if (logsReceived % 10 === 0) {
                console.log(`Received ${logsReceived} logs, current logs array length: ${this.logs.length}`);
                console.log("Last log:", data);
            }
            
            // Keep logs array capped at maximum size
            if (this.logs.length > this.maxLogEntries) {
                this.logs = this.logs.slice(-this.maxLogEntries);
            }
        });
    }
});

// Mount Vue app
const mountedApp = app.mount('#app');
console.log("Vue app mounted");

// Global debug function
window.debugLogs = function() {
    console.log("Current logs array:", mountedApp.logs);
    console.log("Total logs received:", logsReceived);
    console.log("Filtered logs:", mountedApp.filteredLogs);
    console.log("Log filter:", mountedApp.logFilter);
    return {
        logsLength: mountedApp.logs.length,
        filteredLogsLength: mountedApp.filteredLogs.length
    };
}; 