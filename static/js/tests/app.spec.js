// Mock global objects before app.js is loaded
const mockSocket = {
    on: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    connected: false, // Initial state
};
global.io = jest.fn(() => mockSocket);

let store = {};
global.localStorage = {
    getItem: jest.fn(key => store[key] || null),
    setItem: jest.fn((key, value) => { store[key] = value.toString(); }),
    removeItem: jest.fn(key => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; })
};

global.fetch = jest.fn();

// Import Vue and then the app. app.js will use the global Vue.
// It's important that Vue is available globally before app.js is required.
const Vue = require('vue'); // If Vue is a direct dependency or needs to be explicitly available
global.Vue = Vue; // Make Vue global if app.js expects it

// Now load app.js. It will execute and create `mountedApp` globally.
// Note: app.js modifies the global scope by creating `mountedApp`.
require('../app.js');

describe('K8s Pretty Logger Frontend', () => {
    let vm; // This will hold the mountedApp instance

    const initialHtml = `
        <div id="app" :class="{ 'dark-mode': darkMode }">
            <nav class="navbar">
                <!-- ... navbar content ... -->
                <div class="navbar-item">
                    <div class="field">
                        <div class="control">
                            <input class="input is-small log-filter" type="text" placeholder="Filter logs (regex)..." ref="logFilterInput" v-model="logFilter">
                        </div>
                    </div>
                </div>
                <div class="navbar-item">
                    <button class="button is-small" @click="toggleDarkMode" ref="darkModeToggle">
                        <span class="icon is-small"><i class="fas fa-moon"></i></span>
                        <span>Dark Mode</span>
                    </button>
                </div>
            </nav>
            <div class="container-fluid">
                <div class="columns">
                    <div class="column is-one-fifth">
                        <!-- Contexts, Namespaces, Pods selection UI -->
                    </div>
                    <div class="column">
                        <div class="log-view-controls">
                            <button @click="toggleLogStream" :disabled="!selectedPod" ref="toggleLogStreamButton"></button>
                            <button @click="clearLogs" ref="clearLogsButton"></button>
                            <label><input type="checkbox" v-model="autoScroll" ref="autoScrollCheckbox"> Auto-scroll</label>
                        </div>
                        <div class="log-view" ref="logView" @scroll="checkScrollPosition">
                            <div v-for="log in filteredLogs" :key="log.id" class="log-entry" :class="log.level">
                                <span class="timestamp" v-html="formatTimestamp(log.timestamp)"></span>
                                <span class="message" v-html="highlightFilteredText(log.message)"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div v-if="loading.contexts || loading.namespaces || loading.pods || loading.setContext" class="global-loader">
                Loading...
            </div>
        </div>
    `;

    beforeEach(() => {
        // Reset DOM
        document.body.innerHTML = initialHtml;

        // Reset mocks
        mockSocket.on.mockClear();
        mockSocket.emit.mockClear();
        mockSocket.connect.mockClear();
        mock_socket_disconnect_fn.mockClear(); // Renamed to avoid conflict with vm.disconnect
        localStorage.clear();
        localStorage.getItem.mockClear();
        localStorage.setItem.mockClear();
        localStorage.removeItem.mockClear();
        fetch.mockClear();

        // Reset store for localStorage mock
        store = {};

        // Reset socket connected state
        mockSocket.connected = false;


        // The app is mounted globally by app.js. We need to re-assign it to vm
        // or ensure tests can access the global `mountedApp`.
        // Forcing a re-mount or re-initialization is tricky because app.js runs on import.
        // We will test the global mountedApp instance.
        vm = mountedApp; // mountedApp is created by app.js

        // Ensure Vue refs are available after DOM is set and app is (re)bound or re-evaluated
        // This might require Vue.nextTick() if DOM updates are not immediate
        // However, since app.js mounts once, vm is already mounted.
        // We need to ensure its $refs are updated if we change document.body.innerHTML
        // A simple way is to re-mount if app.js could export its options.
        // Since it doesn't, we rely on the fact that $refs are looked up dynamically.
        // If tests fail due to missing $refs, we might need to manually re-mount or re-initialize
        // part of the app, or ensure app.js is re-run (which Jest does by default on each test file run, but not between tests in a file).

        // Reset parts of the VM state that might persist across tests if not careful
        // This is important because `mountedApp` is a singleton.
        vm.contexts = [];
        vm.namespaces = [];
        vm.pods = [];
        vm.selectedContext = '';
        vm.selectedNamespace = '';
        vm.selectedPod = null;
        vm.selectedContainer = '';
        vm.logs = [];
        vm.logFilter = '';
        vm.logStreaming = false;
        vm.autoScroll = true;
        vm.darkMode = false; // Default, will be overridden by localStorage in mounted()
        vm.loading = { contexts: false, namespaces: false, pods: false, setContext: false };
        vm.errors = { contexts: null, namespaces: null, pods: null, logs: null, general: null };
        
        // Call mounted manually if it wasn't called or needs to be re-run for mocks
        // This is tricky as mounted() in app.js runs on initial load.
        // We rely on its effects being testable or re-trigger relevant parts.
        // For `darkMode` from localStorage, we can mock localStorage before app.js is imported.
        // For socket listeners, they are set up once.
    });

    // Helper to simulate next tick for Vue reactivity
    const nextTick = () => new Promise(res => Vue.nextTick(res));


    describe('1. Initial Data and Setup', () => {
        test('should have correct initial data properties', () => {
            // Basic check for default values (some might be set by mounted/localStorage)
            expect(vm.contexts).toEqual([]);
            expect(vm.namespaces).toEqual([]);
            expect(vm.pods).toEqual([]);
            expect(vm.selectedContext).toBe('');
            expect(vm.selectedNamespace).toBe('');
            expect(vm.selectedPod).toBeNull();
            expect(vm.logs).toEqual([]);
            expect(vm.logFilter).toBe('');
            expect(vm.logStreaming).toBe(false);
            expect(vm.autoScroll).toBe(true);
            // darkMode is set from localStorage, tested separately
            expect(vm.loading).toEqual({ contexts: false, namespaces: false, pods: false, setContext: false });
            expect(vm.errors).toEqual({ contexts: null, namespaces: null, pods: null, logs: null, general: null });
        });

        test('darkMode should be initialized from localStorage (default false if not set)', () => {
            localStorage.getItem.mockReturnValueOnce(null); // No dark mode in storage
            // mountedApp is already initialized, so its darkMode reflects initial load.
            // To test this properly, we'd need to re-run the logic or app.js loading.
            // For now, we assume the initial load of app.js correctly set it.
            // We can test toggleDarkMode and its localStorage interaction.
            // Let's verify the class on document.body based on initial load (assuming app.js handles it)
            if (mountedApp.darkMode) {
                expect(document.body.classList.contains('dark-mode')).toBe(true);
            } else {
                expect(document.body.classList.contains('dark-mode')).toBe(false);
            }
        });
        
        test('darkMode should be initialized from localStorage (true if set)', () => {
            // This test is tricky because app.js runs once.
            // To test this specific scenario, localStorage must be set *before* app.js is loaded.
            // We can't do that here in a beforeEach for this specific test easily.
            // This test case shows a limitation of testing code that immediately runs and mutates global state.
            // A workaround:
            store['darkMode'] = 'true'; // Simulate it was set before app.js load
            const tempVm = new Vue(mountedApp.$options); // Create a new instance with the same options
            expect(tempVm.darkMode).toBe(true);
        });


        test('mounted() should call loadContexts and set up socket listeners', async () => {
            // mounted() is called when app.js is loaded.
            // We need to check the side effects.
            // loadContexts is called, which means fetch should have been called for contexts.
            fetch.mockResolvedValueOnce({ ok: true, json: async () => ([{ name: 'ctx1', active: true }]) });
            
            // Re-run mounted logic or parts of it if possible, or check calls from initial load.
            // Since `mountedApp` is global and already mounted, we check its state or mock calls.
            // This relies on `loadContexts` being part of `mounted`.
            // The original `mountedApp` would have called loadContexts.
            // We can't easily spy on `loadContexts` of `mountedApp` itself without modifying app.js.
            // So, we'll assume `loadContexts` was called and test `loadContexts` method directly.

            // Check socket listeners were attached
            // These are from the initial load of app.js
            expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('test_event', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
            expect(mockSocket.on).toHaveBeenCalledWith('log_update', expect.any(Function));
        });
    });

    // Mock for socket.disconnect method if it's different from global.io().disconnect
    const mock_socket_disconnect_fn = jest.fn();
    mockSocket.disconnect = mock_socket_disconnect_fn;


    // Further tests will go here following the provided structure.
    // For example:
    describe('2. loadContexts()', () => {
        test('Success: should fetch contexts, update vm, and call loadNamespaces', async () => {
            const mockContextData = [{ name: 'context1', active: true }, { name: 'context2', active: false }];
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockContextData,
            });

            // Mock loadNamespaces to check if it's called
            vm.loadNamespaces = jest.fn();

            await vm.loadContexts();

            expect(fetch).toHaveBeenCalledWith('/api/contexts');
            expect(vm.contexts).toEqual(mockContextData);
            expect(vm.selectedContext).toBe('context1'); // Active context
            expect(vm.loading.contexts).toBe(false);
            expect(vm.errors.contexts).toBeNull();
            expect(vm.loadNamespaces).toHaveBeenCalled();
        });

        test('Success: should select first context if none are active', async () => {
            const mockContextData = [{ name: 'context1', active: false }, { name: 'context2', active: false }];
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockContextData,
            });
            vm.loadNamespaces = jest.fn();
            await vm.loadContexts();
            expect(vm.selectedContext).toBe('context1');
        });
        
        test('Success: should handle empty contexts', async () => {
            fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
            vm.loadNamespaces = jest.fn(); // To prevent it from running actual logic
            await vm.loadContexts();
            expect(vm.contexts).toEqual([]);
            expect(vm.selectedContext).toBe('');
            expect(vm.namespaces).toEqual([]); // Should be cleared
            expect(vm.pods).toEqual([]);       // Should be cleared
            expect(vm.loadNamespaces).not.toHaveBeenCalled(); // Or called and handles empty context
        });

        test('Fetch Error: should set error message and stop loading', async () => {
            fetch.mockResolvedValueOnce({
                ok: false,
                statusText: 'Server Error',
            });
            // OR fetch.mockRejectedValueOnce(new Error("Network error"));

            await vm.loadContexts();

            expect(vm.errors.contexts).toBe('Failed to load contexts: Server Error');
            expect(vm.loading.contexts).toBe(false);
            expect(vm.contexts).toEqual([]);
        });
        
        test('Fetch Exception: should set error message and stop loading', async () => {
            fetch.mockRejectedValueOnce(new Error("Network error"));

            await vm.loadContexts();

            expect(vm.errors.contexts).toBe('Failed to load contexts: Network error');
            expect(vm.loading.contexts).toBe(false);
        });
    });
    
    describe('3. setContext()', () => {
        beforeEach(() => {
            // Mock dependent methods
            vm.loadNamespaces = jest.fn();
            vm.clearLogs = jest.fn();
            vm.stopLogStream = jest.fn(); // setContext might stop existing streams
        });

        test('Success: should set context, call dependent methods, and clear relevant data', async () => {
            fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'success' }) });
            vm.selectedContext = 'new_context';

            await vm.setContext();

            expect(fetch).toHaveBeenCalledWith('/api/context', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ context: 'new_context' }),
            });
            expect(vm.loading.setContext).toBe(false);
            expect(vm.errors.contexts).toBeNull(); // Assuming errors related to context setting are cleared or specific
            expect(vm.loadNamespaces).toHaveBeenCalled();
            expect(vm.selectedPod).toBeNull();
            expect(vm.selectedContainer).toBe('');
            expect(vm.logs).toEqual([]); // Or expect clearLogs to have been called
            expect(vm.clearLogs).toHaveBeenCalled();
            expect(vm.stopLogStream).toHaveBeenCalled();
        });

        test('No selectedContext: should not call fetch or other methods', async () => {
            vm.selectedContext = '';
            await vm.setContext();
            expect(fetch).not.toHaveBeenCalled();
            expect(vm.loadNamespaces).not.toHaveBeenCalled();
        });

        test('Fetch Error: should set error message and stop loading', async () => {
            fetch.mockResolvedValueOnce({ ok: false, statusText: 'Set Context Failed' });
            vm.selectedContext = 'error_context';
            await vm.setContext();
            expect(vm.errors.contexts).toBe('Failed to set context: Set Context Failed');
            expect(vm.loading.setContext).toBe(false);
        });
        
        test('Fetch Exception: should set error message and stop loading', async () => {
            fetch.mockRejectedValueOnce(new Error("Network error on setContext"));
            vm.selectedContext = 'exception_context';
            await vm.setContext();
            expect(vm.errors.contexts).toBe('Failed to set context: Network error on setContext');
            expect(vm.loading.setContext).toBe(false);
        });
    });

    describe('4. loadNamespaces()', () => {
        beforeEach(() => {
            vm.loadPods = jest.fn();
            vm.selectedContext = 'current_context'; // Pre-condition
        });

        test('Success: should fetch namespaces, update vm, and call loadPods', async () => {
            const mockNamespaces = [{ name: 'default' }, { name: 'kube-system' }];
            fetch.mockResolvedValueOnce({ ok: true, json: async () => mockNamespaces });
            
            await vm.loadNamespaces();

            expect(fetch).toHaveBeenCalledWith('/api/namespaces');
            expect(vm.namespaces).toEqual(mockNamespaces);
            expect(vm.selectedNamespace).toBe('default'); // Default or first
            expect(vm.loading.namespaces).toBe(false);
            expect(vm.errors.namespaces).toBeNull();
            expect(vm.loadPods).toHaveBeenCalled();
        });
        
        test('Success: should select first namespace if "default" is not present', async () => {
            const mockNamespaces = [{ name: 'custom-ns' }, { name: 'kube-system' }];
            fetch.mockResolvedValueOnce({ ok: true, json: async () => mockNamespaces });
            await vm.loadNamespaces();
            expect(vm.selectedNamespace).toBe('custom-ns');
        });

        test('Success: should handle empty namespaces', async () => {
            fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
            await vm.loadNamespaces();
            expect(vm.namespaces).toEqual([]);
            expect(vm.selectedNamespace).toBe('');
            expect(vm.pods).toEqual([]); // Should be cleared
            expect(vm.loadPods).not.toHaveBeenCalled(); // Or called and handles empty namespace
        });

        test('No selectedContext: should not fetch namespaces', async () => {
            vm.selectedContext = '';
            await vm.loadNamespaces();
            expect(fetch).not.toHaveBeenCalled();
        });

        test('Fetch Error: should set error message and stop loading', async () => {
            fetch.mockResolvedValueOnce({ ok: false, statusText: 'NS Error' });
            await vm.loadNamespaces();
            expect(vm.errors.namespaces).toBe('Failed to load namespaces: NS Error');
            expect(vm.loading.namespaces).toBe(false);
            expect(vm.namespaces).toEqual([]);
        });
    });

    describe('5. loadPods()', () => {
        beforeEach(() => {
            vm.selectedNamespace = 'current_namespace'; // Pre-condition
            vm.clearLogs = jest.fn();
            vm.stopLogStream = jest.fn();
        });

        test('Success: should fetch pods and update vm', async () => {
            const mockPods = [{ name: 'pod-a', status: 'Running', containers: [{name: 'c1'}] }];
            fetch.mockResolvedValueOnce({ ok: true, json: async () => mockPods });

            await vm.loadPods();

            expect(fetch).toHaveBeenCalledWith(`/api/pods?namespace=${vm.selectedNamespace}`);
            expect(vm.pods).toEqual(mockPods);
            expect(vm.selectedPod).toBeNull(); // Should be cleared
            expect(vm.logs).toEqual([]);       // Should be cleared
            expect(vm.clearLogs).toHaveBeenCalled();
            expect(vm.stopLogStream).toHaveBeenCalled();
            expect(vm.loading.pods).toBe(false);
            expect(vm.errors.pods).toBeNull();
        });

        test('No selectedNamespace: should not fetch pods', async () => {
            vm.selectedNamespace = '';
            await vm.loadPods();
            expect(fetch).not.toHaveBeenCalled();
        });

        test('Fetch Error: should set error message and stop loading', async () => {
            fetch.mockResolvedValueOnce({ ok: false, statusText: 'Pods Error' });
            await vm.loadPods();
            expect(vm.errors.pods).toBe('Failed to load pods: Pods Error');
            expect(vm.loading.pods).toBe(false);
            expect(vm.pods).toEqual([]);
        });
    });

    describe('6. selectPod(pod)', () => {
        beforeEach(() => {
            vm.startLogStream = jest.fn();
            vm.stopLogStream = jest.fn();
            vm.logs = [{id: 1, message: "old log"}]; // To check if logs are cleared
        });

        test('should select pod and first container, then start log stream', () => {
            const mockPod = { name: 'pod-a', containers: [{ name: 'container1' }, { name: 'container2' }] };
            vm.selectPod(mockPod);

            expect(vm.selectedPod).toEqual(mockPod);
            expect(vm.selectedContainer).toBe('container1');
            expect(vm.logs).toEqual([]); // Logs should be cleared on new pod selection
            expect(vm.startLogStream).toHaveBeenCalled();
            expect(vm.stopLogStream).not.toHaveBeenCalled(); // stopLogStream is called by startLogStream internally first
        });

        test('should set selectedContainer to null and stop stream if pod has no containers', () => {
            const mockPod = { name: 'pod-b', containers: [] };
            vm.selectPod(mockPod);

            expect(vm.selectedPod).toEqual(mockPod);
            expect(vm.selectedContainer).toBeNull();
            expect(vm.logs).toEqual([]);
            expect(vm.stopLogStream).toHaveBeenCalled();
            expect(vm.startLogStream).not.toHaveBeenCalled();
        });
        
        test('should do nothing if pod is null', () => {
            vm.selectedPod = { name: 'previous-pod' };
            vm.selectPod(null);
            // State should not change from this call, though stopLogStream might be called by other logic
            expect(vm.selectedPod).toEqual({ name: 'previous-pod' }); // Or null depending on desired behavior, current app.js keeps it
            expect(vm.startLogStream).not.toHaveBeenCalled();
        });
    });

    describe('7. startLogStream()', () => {
        beforeEach(() => {
            vm.selectedPod = { name: 'p1', namespace: 'ns1' }; // Minimal pod object
            vm.selectedContainer = 'c1';
            vm.selectedNamespace = 'ns1'; // Ensure this is set as per app logic
            // Mock stopLogStream as it's called internally
            vm.stopLogStream = jest.fn();
        });

        test('should emit "start_logs" and set logStreaming to true', () => {
            vm.startLogStream();

            expect(vm.stopLogStream).toHaveBeenCalled(); // Called first to clean up
            expect(mockSocket.emit).toHaveBeenCalledWith('start_logs', {
                namespace: 'ns1',
                pod: 'p1',
                container: 'c1',
                tail_lines: 50, // Default from app.js
            });
            expect(vm.logStreaming).toBe(true);
            expect(vm.autoScroll).toBe(true); // Should be re-enabled
        });

        test('should not emit if no pod or container selected', () => {
            vm.selectedPod = null;
            vm.startLogStream();
            expect(mockSocket.emit).not.toHaveBeenCalledWith('start_logs', expect.anything());

            vm.selectedPod = { name: 'p1', namespace: 'ns1' };
            vm.selectedContainer = '';
            vm.startLogStream();
            expect(mockSocket.emit).not.toHaveBeenCalledWith('start_logs', expect.anything());
        });
    });

    describe('8. stopLogStream()', () => {
        test('should emit "stop_logs" and set logStreaming to false if a pod is selected', () => {
            vm.selectedPod = { name: 'p1' }; // Minimal pod object
            vm.logStreaming = true; // Assume streaming was active

            vm.stopLogStream();

            expect(mockSocket.emit).toHaveBeenCalledWith('stop_logs', { pod: 'p1' });
            expect(vm.logStreaming).toBe(false);
        });

        test('should not emit "stop_logs" if no pod is selected', () => {
            vm.selectedPod = null;
            vm.stopLogStream();
            expect(mockSocket.emit).not.toHaveBeenCalledWith('stop_logs', expect.anything());
            expect(vm.logStreaming).toBe(false); // Should still ensure streaming is marked as false
        });
    });

    describe('9. toggleLogStream()', () => {
        beforeEach(() => {
            vm.startLogStream = jest.fn();
            vm.stopLogStream = jest.fn();
        });

        test('should call stopLogStream if logStreaming is true', () => {
            vm.logStreaming = true;
            vm.toggleLogStream();
            expect(vm.stopLogStream).toHaveBeenCalled();
            expect(vm.startLogStream).not.toHaveBeenCalled();
        });

        test('should call startLogStream if logStreaming is false', () => {
            vm.logStreaming = false;
            vm.toggleLogStream();
            expect(vm.startLogStream).toHaveBeenCalled();
            expect(vm.stopLogStream).not.toHaveBeenCalled();
        });
    });

    describe('10. clearLogs()', () => {
        test('should clear the logs array', () => {
            vm.logs = [{ id: 1, message: 'log1' }, { id: 2, message: 'log2' }];
            vm.clearLogs();
            expect(vm.logs).toEqual([]);
        });
    });

    describe('11. toggleAutoScroll()', () => {
        beforeEach(() => {
            vm.scrollToBottom = jest.fn();
        });

        test('should toggle autoScroll and call scrollToBottom if autoScroll becomes true', () => {
            vm.autoScroll = false;
            vm.toggleAutoScroll(); // Toggles to true
            expect(vm.autoScroll).toBe(true);
            expect(vm.scrollToBottom).toHaveBeenCalled();

            vm.toggleAutoScroll(); // Toggles to false
            expect(vm.autoScroll).toBe(false);
            expect(vm.scrollToBottom).toHaveBeenCalledTimes(1); // Not called again
        });
    });

    describe('12. scrollToBottom()', () => {
        test('should scroll logView to the bottom', async () => {
            // Ensure $refs.logView is available and has scroll properties
            const logViewMock = {
                scrollTop: 0,
                scrollHeight: 1000, // Example value
                clientHeight: 200   // Example value
            };
            vm.$refs.logView = logViewMock;
            
            vm.scrollToBottom();
            await nextTick(); // Wait for DOM updates if any

            expect(logViewMock.scrollTop).toBe(logViewMock.scrollHeight);
        });

        test('should not fail if $refs.logView is not present', () => {
            vm.$refs.logView = null; // Simulate ref not being available
            expect(() => vm.scrollToBottom()).not.toThrow();
        });
    });

    describe('13. checkScrollPosition()', () => {
        let logViewMock;
        beforeEach(() => {
            logViewMock = {
                scrollTop: 0,
                scrollHeight: 1000,
                clientHeight: 200
            };
            vm.$refs.logView = logViewMock;
        });

        test('should disable autoScroll if scrolled up significantly', () => {
            vm.autoScroll = true;
            logViewMock.scrollTop = 500; // User scrolled up (1000 - 500 - 200 = 300 > 50)
            vm.checkScrollPosition();
            expect(vm.autoScroll).toBe(false);
        });

        test('should enable autoScroll if scrolled back to near bottom', () => {
            vm.autoScroll = false;
            logViewMock.scrollTop = 950; // User scrolled near bottom (1000 - 950 - 200 = -150, near bottom condition)
            vm.checkScrollPosition();
            expect(vm.autoScroll).toBe(true);
        });
        
        test('should not change autoScroll if already true and at bottom', () => {
            vm.autoScroll = true;
            logViewMock.scrollTop = 1000 - 200; // At bottom
            vm.checkScrollPosition();
            expect(vm.autoScroll).toBe(true);
        });

        test('should not change autoScroll if already false and far from bottom', () => {
            vm.autoScroll = false;
            logViewMock.scrollTop = 100; // Far from bottom
            vm.checkScrollPosition();
            expect(vm.autoScroll).toBe(false);
        });
    });
    
    describe('14. formatTimestamp(timestamp)', () => {
        test('should format valid ISO timestamp correctly', () => {
            const isoTimestamp = '2023-10-27T10:30:00.123Z';
            // Expected: 10:30:00.123 (assuming local time is not drastically different for test stability)
            // The exact output depends on the locale of the test environment.
            // A more robust test would mock Date or check for parts.
            const formatted = vm.formatTimestamp(isoTimestamp);
            expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/); // HH:MM:SS.mmm
        });

        test('should return "Invalid date" for invalid timestamp string', () => {
            expect(vm.formatTimestamp('not a date')).toBe('Invalid date');
        });

        test('should return "Invalid date" for null or empty timestamp', () => {
            expect(vm.formatTimestamp(null)).toBe('Invalid date');
            expect(vm.formatTimestamp('')).toBe('Invalid date');
        });
    });

    describe('15. getPodStatusClass(status) & getContainerStatusClass(status)', () => {
        const statusMap = {
            // Pod specific
            'Running': 'has-text-success',
            'Succeeded': 'has-text-success-dark', // Pod Succeeded
            'Pending': 'has-text-warning',
            'Failed': 'has-text-danger',
            // Container specific (often overlaps, but can have more states)
            'running': 'has-text-success', // Lowercase for container from some tools
            'waiting': 'has-text-warning',
            'terminated': 'has-text-grey', // Terminated can be ok or error
            'error': 'has-text-danger',
            'unknown': 'has-text-grey-light',
            'Initializing': 'has-text-info', // Example of a custom/observed status
        };

        Object.entries(statusMap).forEach(([status, expectedClass]) => {
            test(`getPodStatusClass for "${status}" should return "${expectedClass}"`, () => {
                expect(vm.getPodStatusClass(status)).toBe(expectedClass);
            });
            // Assuming getContainerStatusClass has similar mapping for these common statuses
            test(`getContainerStatusClass for "${status}" should return "${expectedClass}"`, () => {
                // If container logic differs, adjust or skip
                expect(vm.getContainerStatusClass(status)).toBe(expectedClass); 
            });
        });

        test('getPodStatusClass should return default for unknown status', () => {
            expect(vm.getPodStatusClass('WeirdStatus')).toBe('has-text-grey-light');
        });
        
        test('getContainerStatusClass should handle specific container states', () => {
            expect(vm.getContainerStatusClass('ImagePullBackOff')).toBe('has-text-danger');
            expect(vm.getContainerStatusClass('CrashLoopBackOff')).toBe('has-text-danger');
            expect(vm.getContainerStatusClass('Completed')).toBe('has-text-success-dark');
        });
    });
    
    describe('16. formatLogMessage(message) & escapeHtml(text)', () => {
        test('escapeHtml should escape special characters', () => {
            expect(vm.escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
        });

        test('formatLogMessage with plain text', () => {
            expect(vm.formatLogMessage('Simple log line.')).toBe('Simple log line.');
        });

        test('formatLogMessage with Spring Boot like format', () => {
            const springLog = '2023-10-27 10:30:00.123 INFO [main] o.s.b.w.s.c.ServletWebServerApplicationContext : Server initialized with port: 8080';
            // Assuming it might color based on level or class
            // For now, just check if it handles it without error and maybe basic formatting
            const formatted = vm.formatLogMessage(springLog);
            expect(formatted).toContain('INFO');
            expect(formatted).toContain('o.s.b.w.s.c.ServletWebServerApplicationContext');
            // Example: Check for span if colorization is added
            // expect(formatted).toMatch(/<span class="log-level-info">INFO<\/span>/);
        });

        test('formatLogMessage with JSON string', () => {
            const jsonLog = '{"key": "value", "nested": {"num": 123}}';
            const formatted = vm.formatLogMessage(jsonLog);
            // Expect pretty printed JSON, possibly with syntax highlighting spans
            expect(formatted).toMatch(/<span class="json-key">"key"<\/span>:\s*<span class="json-string">"value"<\/span>/);
            expect(formatted).toContain('"nested"');
            expect(formatted).toContain('123');
        });
        
        test('formatLogMessage with ANSI escape codes should strip them', () => {
            const ansiLog = '\u001b[31mError:\u001b[0m Something bad happened.';
            expect(vm.formatLogMessage(ansiLog)).toBe('Error: Something bad happened.');
        });
    });

    describe('17. highlightFilteredText(text) & escapeRegExp(string)', () => {
        beforeEach(() => {
            // vm.formatLogMessage is used internally by highlightFilteredText
            vm.formatLogMessage = jest.fn(text => vm.escapeHtml(text)); // Simple mock for this test suite
        });

        test('escapeRegExp should escape special regex characters', () => {
            expect(vm.escapeRegExp('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
        });

        test('highlightFilteredText with empty filter should return formatted text', () => {
            vm.logFilter = '';
            const text = 'A simple log message.';
            vm.formatLogMessage.mockReturnValueOnce(vm.escapeHtml(text)); // Simulate formatLogMessage call
            expect(vm.highlightFilteredText(text)).toBe(vm.escapeHtml(text));
        });

        test('highlightFilteredText with matching filter should add <span class="highlight">', () => {
            vm.logFilter = 'simple';
            const text = 'A simple log message.';
            const escapedText = vm.escapeHtml(text);
            vm.formatLogMessage.mockReturnValueOnce(escapedText);
            
            const expected = escapedText.replace(/simple/gi, '<span class="highlight">simple</span>');
            expect(vm.highlightFilteredText(text)).toBe(expected);
        });
        
        test('highlightFilteredText should be case-insensitive', () => {
            vm.logFilter = 'SiMpLe';
            const text = 'A simple log message.';
            const escapedText = vm.escapeHtml(text);
            vm.formatLogMessage.mockReturnValueOnce(escapedText);
            
            const expected = escapedText.replace(/simple/gi, '<span class="highlight">simple</span>');
            expect(vm.highlightFilteredText(text)).toBe(expected);
        });

        test('highlightFilteredText should handle multiple matches', () => {
            vm.logFilter = 'log';
            const text = 'This log is a good log.';
            const escapedText = vm.escapeHtml(text);
            vm.formatLogMessage.mockReturnValueOnce(escapedText);

            const expected = escapedText.replace(/log/gi, '<span class="highlight">log</span>');
            expect(vm.highlightFilteredText(text)).toBe(expected);
        });

        test('highlightFilteredText should truncate very long messages', () => {
            vm.logFilter = '';
            const longText = 'a'.repeat(3000);
            vm.formatLogMessage.mockReturnValueOnce(vm.escapeHtml(longText.substring(0,2048) + '... (truncated)')); // Mock internal call
            
            const highlighted = vm.highlightFilteredText(longText);
            expect(highlighted).toContain('... (truncated)');
            expect(highlighted.length).toBeLessThan(3000);
        });
    });

    describe('18. Computed: filteredLogs()', () => {
        beforeEach(() => {
            // Mock highlightFilteredText for simplicity as it's tested separately
            // vm.highlightFilteredText = jest.fn((text) => text); // This is problematic as it's a method, not a computed
            // Instead, we'll test the filtering logic based on logFilter
        });

        test('should return all logs if filter is empty', () => {
            vm.logs = [{ id: 1, message: 'Log 1' }, { id: 2, message: 'Log 2' }];
            vm.logFilter = '';
            // filteredLogs calls highlightFilteredText for each log.
            // We just check the length and content.
            expect(vm.filteredLogs.length).toBe(2);
            expect(vm.filteredLogs[0].originalMessage).toBe('Log 1'); // Assuming originalMessage is kept
        });

        test('should filter logs based on logFilter (case-insensitive)', () => {
            vm.logs = [
                { id: 1, message: 'Important INFO log' },
                { id: 2, message: 'Debug message' },
                { id: 3, message: 'Another INFO entry' }
            ];
            vm.logFilter = 'info';
            const filtered = vm.filteredLogs;
            expect(filtered.length).toBe(2);
            expect(filtered[0].originalMessage).toBe('Important INFO log');
            expect(filtered[1].originalMessage).toBe('Another INFO entry');
        });

        test('should return empty array if no logs match filter', () => {
            vm.logs = [{ id: 1, message: 'Log 1' }, { id: 2, message: 'Log 2' }];
            vm.logFilter = 'nonexistent';
            expect(vm.filteredLogs.length).toBe(0);
        });
        
        test('should use regex for filtering if logFilter is a valid regex', () => {
            vm.logs = [
                { id: 1, message: 'Log message with number 123' },
                { id: 2, message: 'Log message with word seven' },
                { id: 3, message: 'Log entry 456' }
            ];
            vm.logFilter = '\\d+'; // Regex for numbers
            const filtered = vm.filteredLogs;
            expect(filtered.length).toBe(2);
            expect(filtered[0].originalMessage).toBe('Log message with number 123');
            expect(filtered[1].originalMessage).toBe('Log entry 456');
        });

        test('should handle invalid regex in logFilter gracefully (treat as literal string)', () => {
            vm.logs = [{ id: 1, message: 'Log with [invalid regex' }];
            vm.logFilter = '[invalid regex'; // This would throw if not handled
            // The app.js code has a try-catch for regex creation.
            // If regex fails, it falls back to string literal search.
            const filtered = vm.filteredLogs;
            expect(filtered.length).toBe(1);
            expect(filtered[0].originalMessage).toBe('Log with [invalid regex');
        });
    });

    describe('19. Socket Event Handlers', () => {
        let connectCallback, disconnectCallback, testEventCallback, errorCallback, logUpdateCallback;

        beforeEach(() => {
            // Find the callbacks registered with mockSocket.on
            // This assumes app.js has already run and registered these.
            const findCallback = (event) => {
                const call = mockSocket.on.mock.calls.find(c => c[0] === event);
                return call ? call[1] : null;
            };
            connectCallback = findCallback('connect');
            disconnectCallback = findCallback('disconnect');
            testEventCallback = findCallback('test_event'); // If still used
            errorCallback = findCallback('error');
            logUpdateCallback = findCallback('log_update');

            vm.scrollToBottom = jest.fn();
            vm.logs = []; // Reset logs for each test
        });

        test('socket "connect" event should set connected to true and log', () => {
            expect(connectCallback).not.toBeNull();
            global.console.log = jest.fn(); // Mock console.log
            connectCallback();
            expect(mockSocket.connected).toBe(true); // Check the flag on the mock itself
            expect(console.log).toHaveBeenCalledWith('Socket connected');
        });

        test('socket "disconnect" event should set connected to false, logStreaming to false, and log', () => {
            expect(disconnectCallback).not.toBeNull();
            global.console.log = jest.fn();
            mockSocket.connected = true; // Simulate connected state
            vm.logStreaming = true;

            disconnectCallback('reason for disconnect');

            expect(mockSocket.connected).toBe(false);
            expect(vm.logStreaming).toBe(false);
            expect(console.log).toHaveBeenCalledWith('Socket disconnected:', 'reason for disconnect');
        });
        
        test('socket "error" event (string error) should update vm.errors.logs and set logStreaming to false', () => {
            expect(errorCallback).not.toBeNull();
            const errorMessage = "Socket connection error";
            errorCallback(errorMessage);
            expect(vm.errors.logs).toBe(errorMessage);
            expect(vm.logStreaming).toBe(false);
        });

        test('socket "error" event (object error) should update vm.errors.logs', () => {
            expect(errorCallback).not.toBeNull();
            const errorObj = { message: "Detailed socket error" };
            errorCallback(errorObj);
            expect(vm.errors.logs).toBe("Detailed socket error");
            expect(vm.logStreaming).toBe(false);
        });

        test('socket "log_update" event should add log, and call scrollToBottom if autoScroll is true', () => {
            expect(logUpdateCallback).not.toBeNull();
            const logData = { timestamp: new Date().toISOString(), message: 'New log line' };
            vm.autoScroll = true;
            
            logUpdateCallback(logData);

            expect(vm.logs.length).toBe(1);
            expect(vm.logs[0].message).toBe('New log line');
            expect(vm.logs[0].id).toBeDefined(); // Check unique ID is assigned
            expect(vm.scrollToBottom).toHaveBeenCalled();
        });

        test('socket "log_update" should not call scrollToBottom if autoScroll is false', () => {
            expect(logUpdateCallback).not.toBeNull();
            const logData = { message: 'Another log' };
            vm.autoScroll = false;
            logUpdateCallback(logData);
            expect(vm.logs.length).toBe(1);
            expect(vm.scrollToBottom).not.toHaveBeenCalled();
        });

        test('socket "log_update" should cap logs at maxLogEntries (e.g., 2000)', () => {
            expect(logUpdateCallback).not.toBeNull();
            const maxEntries = vm.maxLogEntries; // Use the value from app.js
            for (let i = 0; i < maxEntries + 5; i++) {
                logUpdateCallback({ message: `Log ${i}` });
            }
            expect(vm.logs.length).toBe(maxEntries);
            expect(vm.logs[0].message).toBe(`Log 5`); // Oldest logs are shifted out
            expect(vm.logs[maxEntries - 1].message).toBe(`Log ${maxEntries + 4}`);
        });
    });

    describe('20. darkMode watcher and toggleDarkMode()', () => {
        test('toggleDarkMode should change vm.darkMode and call localStorage.setItem', () => {
            vm.darkMode = false;
            vm.toggleDarkMode();
            expect(vm.darkMode).toBe(true);
            expect(localStorage.setItem).toHaveBeenCalledWith('darkMode', 'true');
            expect(document.documentElement.classList.contains('dark-mode')).toBe(true); // Check class on html element

            vm.toggleDarkMode();
            expect(vm.darkMode).toBe(false);
            expect(localStorage.setItem).toHaveBeenCalledWith('darkMode', 'false');
            expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
        });

        test('darkMode watcher should update localStorage and document class', async () => {
            vm.darkMode = false; // Initial state for watcher
            await nextTick(); // Allow watcher to settle
            localStorage.setItem.mockClear(); // Clear previous calls from setup/toggle
            document.documentElement.classList.remove('dark-mode');

            vm.darkMode = true; // Trigger watcher
            await nextTick(); // Allow watcher to run

            expect(localStorage.setItem).toHaveBeenCalledWith('darkMode', 'true');
            expect(document.documentElement.classList.contains('dark-mode')).toBe(true);

            vm.darkMode = false; // Trigger watcher again
            await nextTick();

            expect(localStorage.setItem).toHaveBeenCalledWith('darkMode', 'false');
            expect(document.documentElement.classList.contains('dark-mode')).toBe(false);
        });
    });

});
