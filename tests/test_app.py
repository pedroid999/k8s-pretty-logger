import pytest
import json
from unittest.mock import patch, ANY
from app import app, socketio # Import socketio for use in tests

# Fixtures are automatically discovered from conftest.py

def test_index(client):
    """Test the index route."""
    response = client.get('/')
    assert response.status_code == 200
    assert b"<title>K8s Pretty Logger</title>" in response.data

# Tests for /api/contexts
def test_get_contexts_success(client):
    """Test successful retrieval of contexts."""
    with patch('app.k8s_client.get_contexts') as mock_get_contexts:
        mock_get_contexts.return_value = [{'name': 'context1', 'active': True}, {'name': 'context2', 'active': False}]
        response = client.get('/api/contexts')
        assert response.status_code == 200
        assert response.json == [{'name': 'context1', 'active': True}, {'name': 'context2', 'active': False}]

def test_get_contexts_error(client):
    """Test error handling when retrieving contexts."""
    with patch('app.k8s_client.get_contexts') as mock_get_contexts:
        mock_get_contexts.side_effect = Exception("Test K8s Error")
        response = client.get('/api/contexts')
        assert response.status_code == 500
        assert response.json == {"error": "Test K8s Error"}

# Tests for /api/context (POST)
def test_set_context_success(client):
    """Test successful setting of context."""
    with patch('app.k8s_client.set_context') as mock_set_context:
        response = client.post('/api/context', json={'context': 'new_context'})
        assert response.status_code == 200
        assert response.json == {"status": "success"}
        mock_set_context.assert_called_once_with('new_context')

def test_set_context_missing_name(client):
    """Test error when context name is missing."""
    response = client.post('/api/context', json={})
    assert response.status_code == 400
    assert response.json == {"error": "Context name is required"}

def test_set_context_error(client):
    """Test error handling when setting context fails."""
    with patch('app.k8s_client.set_context') as mock_set_context:
        mock_set_context.side_effect = Exception("Test K8s Error")
        response = client.post('/api/context', json={'context': 'error_context'})
        assert response.status_code == 500
        assert response.json == {"error": "Test K8s Error"}

# Tests for /api/namespaces (GET)
def test_get_namespaces_success(client):
    """Test successful retrieval of namespaces."""
    with patch('app.k8s_client.get_namespaces') as mock_get_namespaces:
        mock_get_namespaces.return_value = [{'name': 'ns1', 'status': 'Active'}]
        response = client.get('/api/namespaces')
        assert response.status_code == 200
        assert response.json == [{'name': 'ns1', 'status': 'Active'}]

def test_get_namespaces_error(client):
    """Test error handling when retrieving namespaces."""
    with patch('app.k8s_client.get_namespaces') as mock_get_namespaces:
        mock_get_namespaces.side_effect = Exception("Test K8s Error")
        response = client.get('/api/namespaces')
        assert response.status_code == 500
        assert response.json == {"error": "Test K8s Error"}

# Tests for /api/pods (GET)
def test_get_pods_success(client):
    """Test successful retrieval of pods."""
    with patch('app.k8s_client.get_pods') as mock_get_pods:
        mock_get_pods.return_value = [{'name': 'pod1', 'namespace': 'ns1', 'status': 'Running', 'containers': [], 'creation_timestamp': 'N/A'}]
        response = client.get('/api/pods?namespace=ns1')
        assert response.status_code == 200
        assert response.json == [{'name': 'pod1', 'namespace': 'ns1', 'status': 'Running', 'containers': [], 'creation_timestamp': 'N/A'}]
        mock_get_pods.assert_called_once_with('ns1')

def test_get_pods_default_namespace(client):
    """Test retrieval of pods from default namespace."""
    with patch('app.k8s_client.get_pods') as mock_get_pods:
        mock_get_pods.return_value = [] # Return empty for simplicity
        response = client.get('/api/pods')
        assert response.status_code == 200
        mock_get_pods.assert_called_once_with('default')

def test_get_pods_error(client):
    """Test error handling when retrieving pods."""
    with patch('app.k8s_client.get_pods') as mock_get_pods:
        mock_get_pods.side_effect = Exception("Test K8s Error")
        response = client.get('/api/pods?namespace=ns1')
        assert response.status_code == 500
        assert response.json == {"error": "Test K8s Error"}

# Tests for Socket.IO events
def test_socket_connect_disconnect(socketio_client, caplog):
    """Test client connect and disconnect events."""
    # Note: caplog fixture is used to capture log messages
    # Ensure logging is configured in app.py for these messages to be captured
    # For example: import logging; logging.basicConfig(level=logging.INFO)

    # Connect
    socketio_client.connect()
    assert 'Client connected' in caplog.text # Check specific log message

    # Disconnect
    socketio_client.disconnect()
    assert 'Client disconnected' in caplog.text # Check specific log message

@patch('app.socketio.emit') # Mock socketio.emit
@patch('app.k8s_client.stream_pod_logs') # Mock k8s_client.stream_pod_logs
def test_socket_start_logs(mock_stream_pod_logs, mock_socketio_emit, socketio_client):
    """Test starting logs via socket event."""
    # Define a simple generator for mock_stream_pod_logs
    def mock_log_stream_generator(*args, **kwargs):
        yield "Log line 1"
        yield "Log line 2"

    mock_stream_pod_logs.return_value = mock_log_stream_generator()

    socketio_client.connect() # Connect the client first
    socketio_client.emit('start_logs', {
        'namespace': 'test_ns',
        'pod': 'test_pod',
        'container': 'test_container',
        'tail_lines': 50
    })

    mock_stream_pod_logs.assert_called_once_with('test_ns', 'test_pod', 'test_container', 50, ANY)

    # Check that socketio.emit was called with the log updates
    # This is a bit more complex as emit is called for each log line
    # We can check if it was called with 'log_update' and some data
    calls = [
        ((('log_update', {'data': 'Log line 1'}),), {}),
        ((('log_update', {'data': 'Log line 2'}),), {})
    ]
    #mock_socketio_emit.assert_has_calls(calls, any_order=False) # This can be too strict if other emits happen

    # More robust check: iterate through calls
    log_update_called_with_line1 = False
    log_update_called_with_line2 = False
    for call_args in mock_socketio_emit.call_args_list:
        if call_args[0][0] == 'log_update':
            if call_args[0][1]['data'] == "Log line 1":
                log_update_called_with_line1 = True
            if call_args[0][1]['data'] == "Log line 2":
                log_update_called_with_line2 = True
    assert log_update_called_with_line1, "emit was not called with 'Log line 1'"
    assert log_update_called_with_line2, "emit was not called with 'Log line 2'"


    # Test case where pod_name is not provided (should not call stream_pod_logs or emit)
    mock_stream_pod_logs.reset_mock()
    mock_socketio_emit.reset_mock()
    socketio_client.emit('start_logs', { # Missing 'pod'
        'namespace': 'test_ns',
        'container': 'test_container',
        'tail_lines': 50
    })
    mock_stream_pod_logs.assert_not_called()
    # Check if an error was emitted or handled appropriately, e.g., an 'error' event
    # For now, we'll assume it doesn't call if 'pod' is missing, based on typical handler logic.
    # A specific 'error' emit for missing parameters could be tested if implemented in app.py

@patch('app.socketio.emit') # Mock socketio.emit for checking error event
@patch('app.k8s_client.stream_pod_logs')
def test_socket_start_logs_error(mock_stream_pod_logs, mock_socketio_emit, socketio_client):
    """Test error handling when starting logs fails."""
    mock_stream_pod_logs.side_effect = Exception("K8s Stream Error")

    socketio_client.connect()
    socketio_client.emit('start_logs', {
        'namespace': 'test_ns',
        'pod': 'test_pod_error',
        'container': 'test_container',
        'tail_lines': 10
    })

    # Assert that an 'error' event was emitted
    error_emitted = False
    for call_args in mock_socketio_emit.call_args_list:
        if call_args[0][0] == 'error':
            assert 'K8s Stream Error' in call_args[0][1]['error']
            error_emitted = True
            break
    assert error_emitted, "Socket 'error' event was not emitted"


@patch('app.k8s_client.stop_log_stream')
def test_socket_stop_logs(mock_stop_log_stream, socketio_client):
    """Test stopping logs via socket event."""
    socketio_client.connect()
    socketio_client.emit('stop_logs', {'pod': 'test_pod_to_stop'})
    mock_stop_log_stream.assert_called_once_with('test_pod_to_stop')

    # Test case where pod_name is not provided
    mock_stop_log_stream.reset_mock()
    socketio_client.emit('stop_logs', {}) # Missing 'pod'
    mock_stop_log_stream.assert_not_called() # stop_log_stream should not be called
    # If specific error handling for missing 'pod' is in place (e.g., emitting an 'error' event), test for that.
    # For now, assuming it simply doesn't call if 'pod' is missing.
