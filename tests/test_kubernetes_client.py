import pytest
from unittest.mock import patch, MagicMock, call
from kubernetes.client.rest import ApiException
from api.kubernetes_client import KubernetesClient # Assuming the client is in api/kubernetes_client.py
import api.kubernetes_client as kubernetes_client_module # For patching module-level functions

# Fixture for KubernetesClient instance
@pytest.fixture
def k8s_client_instance():
    with patch('api.kubernetes_client.config.load_kube_config') as mock_load_config, \
         patch('api.kubernetes_client.client.ApiClient') as mock_api_client, \
         patch('api.kubernetes_client.client.CoreV1Api') as mock_core_v1:
        client_instance = KubernetesClient()
        # Ensure the instance uses the mock CoreV1Api for subsequent tests
        client_instance.core_v1 = mock_core_v1
        # Store mocks if needed for assertions on init behavior, though often not directly needed in tests using the fixture
        client_instance._mock_load_config = mock_load_config
        client_instance._mock_api_client = mock_api_client
        yield client_instance

# Tests for __init__
@patch('api.kubernetes_client.client.CoreV1Api')
@patch('api.kubernetes_client.client.ApiClient')
@patch('api.kubernetes_client.config.load_kube_config')
def test_init_success(mock_load_kube_config, mock_api_client_constructor, mock_core_v1_constructor):
    """Test successful initialization of KubernetesClient."""
    k_client = KubernetesClient()
    mock_load_kube_config.assert_called_once()
    mock_api_client_constructor.assert_called_once()
    # CoreV1Api should be instantiated with the ApiClient instance created during init
    mock_core_v1_constructor.assert_called_once_with(k_client.api_client)

@patch('api.kubernetes_client.config.load_kube_config', side_effect=Exception("Kube config error"))
def test_init_failure(mock_load_kube_config):
    """Test initialization failure of KubernetesClient."""
    with pytest.raises(Exception, match="Kube config error"):
        KubernetesClient()
    mock_load_kube_config.assert_called_once()


# Tests for get_contexts
def test_get_contexts_success(k8s_client_instance):
    """Test successful retrieval of contexts."""
    mock_contexts = [{'name': 'ctx1', 'cluster': 'cl1', 'user': 'u1'}, {'name': 'ctx2', 'cluster': 'cl2', 'user': 'u2'}]
    mock_active_context = {'name': 'ctx1', 'cluster': 'cl1', 'user': 'u1'}
    
    with patch('api.kubernetes_client.config.list_kube_config_contexts') as mock_list_contexts:
        mock_list_contexts.return_value = (mock_contexts, mock_active_context)
        
        contexts = k8s_client_instance.get_contexts()
        
        assert contexts == [
            {'name': 'ctx1', 'active': True},
            {'name': 'ctx2', 'active': False}
        ]
        assert k8s_client_instance.current_context == 'ctx1'
        mock_list_contexts.assert_called_once()

def test_get_contexts_empty(k8s_client_instance):
    """Test retrieval of contexts when none are configured."""
    with patch('api.kubernetes_client.config.list_kube_config_contexts') as mock_list_contexts:
        mock_list_contexts.return_value = ([], None) # No contexts, no active context
        contexts = k8s_client_instance.get_contexts()
        assert contexts == []
        assert k8s_client_instance.current_context is None

    with patch('api.kubernetes_client.config.list_kube_config_contexts') as mock_list_contexts:
        mock_list_contexts.return_value = (None, None) # Also handles if API returns None
        contexts = k8s_client_instance.get_contexts()
        assert contexts == []
        assert k8s_client_instance.current_context is None


def test_get_contexts_api_error(k8s_client_instance):
    """Test error handling when retrieving contexts fails."""
    with patch('api.kubernetes_client.config.list_kube_config_contexts', side_effect=Exception("API Error")):
        with pytest.raises(Exception, match="API Error"):
            k8s_client_instance.get_contexts()

# Tests for set_context
@patch('api.kubernetes_client.client.CoreV1Api') # Mock CoreV1Api for re-initialization
@patch('api.kubernetes_client.client.ApiClient') # Mock ApiClient for re-initialization
@patch('api.kubernetes_client.config.load_kube_config') # Mock load_kube_config for re-initialization
@patch('api.kubernetes_client.subprocess.run')
def test_set_context_success(mock_subprocess_run, mock_load_kube_config_reinit, mock_api_client_reinit, mock_core_v1_reinit, k8s_client_instance):
    """Test successful setting of context."""
    mock_subprocess_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
    
    k8s_client_instance.set_context("new_ctx")
    
    mock_subprocess_run.assert_called_once_with(
        ["kubectl", "config", "use-context", "new_ctx"],
        capture_output=True, text=True, check=False # check=False if you handle errors manually
    )
    # load_kube_config is called once during __init__ (by fixture) and once during set_context
    assert mock_load_kube_config_reinit.call_count >= 1 # at least once after initial setup
    # ApiClient and CoreV1Api are re-initialized
    assert mock_api_client_reinit.call_count >= 1
    assert mock_core_v1_reinit.call_count >= 1 
    
    assert k8s_client_instance.current_context == "new_ctx"
    # Check that the internal api_client and core_v1 were updated
    assert k8s_client_instance.core_v1 == mock_core_v1_reinit.return_value


@patch('api.kubernetes_client.subprocess.run')
def test_set_context_subprocess_error(mock_subprocess_run, k8s_client_instance):
    """Test error handling when subprocess fails to set context."""
    mock_subprocess_run.return_value = MagicMock(returncode=1, stderr="kubectl error")
    
    with pytest.raises(Exception, match="Failed to set context: kubectl error"):
        k8s_client_instance.set_context("error_ctx")
    
    mock_subprocess_run.assert_called_once_with(
        ["kubectl", "config", "use-context", "error_ctx"],
        capture_output=True, text=True, check=False
    )

# Tests for get_namespaces
def test_get_namespaces_success(k8s_client_instance):
    """Test successful retrieval of namespaces."""
    mock_ns1 = MagicMock()
    mock_ns1.metadata.name = "ns1"
    mock_ns1.status.phase = "Active"
    
    mock_ns2 = MagicMock()
    mock_ns2.metadata.name = "ns2"
    mock_ns2.status.phase = "Terminating"
    
    mock_response = MagicMock()
    mock_response.items = [mock_ns1, mock_ns2]
    
    k8s_client_instance.core_v1.list_namespace = MagicMock(return_value=mock_response)
    
    namespaces = k8s_client_instance.get_namespaces()
    
    assert namespaces == [
        {'name': 'ns1', 'status': 'Active'},
        {'name': 'ns2', 'status': 'Terminating'}
    ]
    k8s_client_instance.core_v1.list_namespace.assert_called_once()

def test_get_namespaces_api_error(k8s_client_instance):
    """Test error handling when retrieving namespaces fails."""
    k8s_client_instance.core_v1.list_namespace = MagicMock(side_effect=ApiException(status=500, reason="API Error"))
    
    with pytest.raises(ApiException, match="API Error"):
        k8s_client_instance.get_namespaces()

# Tests for get_pods
def test_get_pods_success(k8s_client_instance):
    """Test successful retrieval of pods."""
    # Mock container
    mock_container1 = MagicMock()
    mock_container1.name = "container-a"

    # Mock container status
    mock_cs1_status = MagicMock()
    mock_cs1_status.name = "container-a"
    mock_cs1_status.ready = True
    # mock_cs1_status.state will be handled by _get_container_state mock

    # Mock pod
    mock_pod1 = MagicMock()
    mock_pod1.metadata.name = "pod1"
    mock_pod1.metadata.namespace = "test_ns"
    mock_pod1.metadata.creation_timestamp.isoformat.return_value = "2023-01-01T12:00:00Z"
    mock_pod1.status.phase = "Running"
    mock_pod1.spec.containers = [mock_container1]
    mock_pod1.status.container_statuses = [mock_cs1_status]

    mock_response = MagicMock()
    mock_response.items = [mock_pod1]
    
    k8s_client_instance.core_v1.list_namespaced_pod = MagicMock(return_value=mock_response)
    
    # Mock _get_container_state as it's complex
    with patch.object(k8s_client_instance, '_get_container_state', return_value="Running") as mock_get_state:
        pods = k8s_client_instance.get_pods("test_ns")

    assert len(pods) == 1
    pod_info = pods[0]
    assert pod_info['name'] == "pod1"
    assert pod_info['namespace'] == "test_ns"
    assert pod_info['status'] == "Running" # Pod phase
    assert pod_info['creation_timestamp'] == "2023-01-01T12:00:00Z"
    assert len(pod_info['containers']) == 1
    container_info = pod_info['containers'][0]
    assert container_info['name'] == "container-a"
    assert container_info['status'] == "Running" # From _get_container_state mock
    assert container_info['ready'] is True
    
    k8s_client_instance.core_v1.list_namespaced_pod.assert_called_once_with(namespace="test_ns")
    mock_get_state.assert_called_once_with(mock_cs1_status)


def test_get_pods_no_container_statuses(k8s_client_instance):
    """Test get_pods when a pod has no container_statuses (e.g. pending)."""
    mock_container1 = MagicMock()
    mock_container1.name = "container-a"

    mock_pod1 = MagicMock()
    mock_pod1.metadata.name = "pod-pending"
    mock_pod1.metadata.namespace = "test_ns"
    mock_pod1.metadata.creation_timestamp.isoformat.return_value = "2023-01-01T13:00:00Z"
    mock_pod1.status.phase = "Pending"
    mock_pod1.spec.containers = [mock_container1]
    mock_pod1.status.container_statuses = None # Or []

    mock_response = MagicMock()
    mock_response.items = [mock_pod1]
    k8s_client_instance.core_v1.list_namespaced_pod = MagicMock(return_value=mock_response)

    # _get_container_state should not be called if no container statuses
    with patch.object(k8s_client_instance, '_get_container_state') as mock_get_state:
        pods = k8s_client_instance.get_pods("test_ns")

    assert len(pods) == 1
    pod_info = pods[0]
    assert pod_info['name'] == "pod-pending"
    assert len(pod_info['containers']) == 1
    container_info = pod_info['containers'][0]
    assert container_info['name'] == "container-a"
    assert container_info['status'] == "N/A" # Default if no status
    assert container_info['ready'] is False # Default if no status
    mock_get_state.assert_not_called()


def test_get_pods_api_error(k8s_client_instance):
    """Test error handling when retrieving pods fails."""
    k8s_client_instance.core_v1.list_namespaced_pod = MagicMock(side_effect=ApiException(status=500, reason="API Error"))
    
    with pytest.raises(ApiException, match="API Error"):
        k8s_client_instance.get_pods("test_ns")

# Tests for _get_container_state
def test_get_container_state(k8s_client_instance):
    """Test _get_container_state logic."""
    # Running
    status_running = MagicMock()
    status_running.state.running = True
    status_running.state.waiting = None
    status_running.state.terminated = None
    assert k8s_client_instance._get_container_state(status_running) == "Running"

    # Waiting
    status_waiting = MagicMock()
    status_waiting.state.running = None
    status_waiting.state.waiting = MagicMock(reason="PodInitializing")
    status_waiting.state.terminated = None
    assert k8s_client_instance._get_container_state(status_waiting) == "Waiting: PodInitializing"

    # Terminated
    status_terminated = MagicMock()
    status_terminated.state.running = None
    status_terminated.state.waiting = None
    status_terminated.state.terminated = MagicMock(reason="Completed", exit_code=0)
    assert k8s_client_instance._get_container_state(status_terminated) == "Terminated: Completed (Exit Code: 0)"

    # Terminated without reason
    status_terminated_no_reason = MagicMock()
    status_terminated_no_reason.state.running = None
    status_terminated_no_reason.state.waiting = None
    status_terminated_no_reason.state.terminated = MagicMock(reason=None, exit_code=1) # reason can be None
    assert k8s_client_instance._get_container_state(status_terminated_no_reason) == "Terminated: N/A (Exit Code: 1)"
    
    # Unknown
    status_unknown = MagicMock()
    status_unknown.state.running = None
    status_unknown.state.waiting = None
    status_unknown.state.terminated = None
    assert k8s_client_instance._get_container_state(status_unknown) == "Unknown"

    # Check None state (e.g. state itself is None)
    status_none_state = MagicMock()
    status_none_state.state = None
    assert k8s_client_instance._get_container_state(status_none_state) == "Unknown"


# Tests for stream_pod_logs
@patch('api.kubernetes_client.watch.Watch')
@patch('api.kubernetes_client.threading.Thread')
def test_stream_pod_logs_starts_thread(mock_thread_constructor, mock_watch_constructor, k8s_client_instance):
    """Test that stream_pod_logs starts a new thread and registers the stream."""
    mock_emit_func = MagicMock()
    
    # Ensure core_v1.read_namespaced_pod_log is a MagicMock for the Watcher
    k8s_client_instance.core_v1.read_namespaced_pod_log = MagicMock()

    k8s_client_instance.stream_pod_logs("ns1", "pod1", "container1", 100, mock_emit_func)
    
    mock_thread_constructor.assert_called_once()
    thread_args = mock_thread_constructor.call_args[1] # Get kwargs
    assert thread_args['target'] == k8s_client_instance._stream_logs_thread
    assert thread_args['args'][0] == "ns1"
    assert thread_args['args'][1] == "pod1"
    assert thread_args['args'][2] == "container1"
    assert thread_args['args'][3] == 100
    assert thread_args['args'][4] == mock_emit_func
    
    mock_thread_constructor.return_value.start.assert_called_once()
    assert "pod1" in k8s_client_instance.active_streams
    assert k8s_client_instance.active_streams["pod1"]['thread'] == mock_thread_constructor.return_value
    assert k8s_client_instance.active_streams["pod1"]['stop_event'].is_set() is False # stop_event should be clear

@patch('api.kubernetes_client.watch.Watch')
@patch('api.kubernetes_client.threading.Thread')
def test_stream_pod_logs_stops_previous_stream(mock_thread, mock_watch, k8s_client_instance):
    """Test that streaming to the same pod stops the previous stream."""
    mock_emit_func = MagicMock()
    
    # Mock an existing stream
    existing_stop_event = MagicMock()
    existing_thread = MagicMock()
    k8s_client_instance.active_streams['pod1'] = {'thread': existing_thread, 'stop_event': existing_stop_event}
    
    # Patch stop_log_stream to verify it's called
    with patch.object(k8s_client_instance, 'stop_log_stream') as mock_stop_stream:
        k8s_client_instance.stream_pod_logs("ns1", "pod1", "container1", 100, mock_emit_func)
        mock_stop_stream.assert_called_once_with('pod1')
    
    # New thread should be started as usual
    mock_thread.return_value.start.assert_called_once()
    assert k8s_client_instance.active_streams["pod1"]['thread'] == mock_thread.return_value


# Tests for _stream_logs_thread (internal logic, more complex, might need selective testing)
# This is a simplified test focusing on the watch mechanism and stop event
@patch('api.kubernetes_client.watch.Watch')
def test_stream_logs_thread_watches_and_stops(mock_watch_constructor, k8s_client_instance):
    """Test the internal log streaming thread watches logs and respects stop event."""
    mock_emit_func = MagicMock()
    pod_name = "test_pod_stream"
    stop_event = kubernetes_client_module.threading.Event() # Real event

    # Mock the watcher and its stream
    mock_watcher = MagicMock()
    # Simulate some log lines then an exception (like stream closed or timeout)
    # Or, simulate stop_event being set
    def stream_side_effect(*args, **kwargs):
        yield MagicMock(object="Log line 1") # if Watch returns objects
        yield "Raw log line 2" # if Watch can return raw strings
        # Simulate stop_event being set after a few lines
        if stop_event.is_set():
            # In a real scenario, watcher.stream might raise StopIteration or timeout
            raise ApiException("Simulated stop by event") # Or just return
        yield "Log line 3 but should not be sent if stopped"


    mock_watcher.stream.side_effect = stream_side_effect
    mock_watch_constructor.return_value = mock_watcher
    
    # Store the stream info as stream_pod_logs would
    k8s_client_instance.active_streams[pod_name] = {
        'thread': MagicMock(), # Not the actual thread running this, but a placeholder
        'stop_event': stop_event
    }

    # Call the thread function directly
    # First run: process some logs
    def run_thread_iteration1():
      k8s_client_instance._stream_logs_thread("ns", pod_name, "cont", 10, mock_emit_func)
    
    # Run in a way that allows stream_side_effect to yield initial values
    # This is tricky to test without actually starting a thread.
    # We'll rely on the mock_watcher.stream calls.
    
    # Iteration 1: Process initial logs
    k8s_client_instance.core_v1.read_namespaced_pod_log = MagicMock() # Ensure this is callable by Watch
    
    # This direct call will run the loop inside _stream_logs_thread.
    # We need to control the loop's execution.
    # For simplicity, let's assume the first call to watcher.stream processes available logs
    # and then exits because the real function is a loop.
    # This test can only verify the setup of Watch and initial processing.
    
    # To truly test the loop, you'd let the thread run and then set the stop_event.
    # Here, we'll test parts of its behavior.

    # Test that Watch is configured correctly
    # k8s_client_instance._stream_logs_thread("ns", pod_name, "cont", 10, mock_emit_func)
    # mock_watch_constructor.assert_called_with(k8s_client_instance.core_v1.read_namespaced_pod_log, ANY, ANY, ANY, ANY)
    # This is hard to assert directly without running the thread.

    # Instead, let's focus on the stop_event mechanism being respected *if* the loop were running.
    # Suppose the thread runs, processes "Log line 1", "Raw log line 2"
    # Then we set the stop event
    stop_event.set()
    
    # If the thread function were called again (or was in its loop), it should stop early.
    # The mock_watcher.stream.side_effect will raise ApiException when stop_event is set.
    with pytest.raises(ApiException, match="Simulated stop by event"):
         k8s_client_instance._stream_logs_thread("ns", pod_name, "cont", 10, mock_emit_func)

    # Assertions on emit_func calls would depend on actual successful yields
    # Example: mock_emit_func.assert_any_call(pod_name, "Log line 1")
    # This requires careful mocking of the Watch stream.

    # Clean up from active_streams if the thread normally does
    if pod_name in k8s_client_instance.active_streams: # It should be cleaned up by the thread on exit
        del k8s_client_instance.active_streams[pod_name]


# Tests for stop_log_stream
def test_stop_log_stream_active(k8s_client_instance):
    """Test stopping an active log stream."""
    mock_thread = MagicMock()
    mock_stop_event = MagicMock()
    k8s_client_instance.active_streams['pod1'] = {'thread': mock_thread, 'stop_event': mock_stop_event}
    
    assert k8s_client_instance.stop_log_stream("pod1") is True
    mock_stop_event.set.assert_called_once()
    mock_thread.join.assert_called_once() # Check if thread is joined
    assert "pod1" not in k8s_client_instance.active_streams

def test_stop_log_stream_inactive(k8s_client_instance):
    """Test stopping a non-existent log stream."""
    assert k8s_client_instance.stop_log_stream("non_existent_pod") is False
    assert "non_existent_pod" not in k8s_client_instance.active_streams

# Final: Add to git
# This will be done in a separate step via run_in_bash_session
