#!/usr/bin/env python
# -*- coding: utf-8 -*-

from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO
import os
import json
import logging
from api.kubernetes_client import KubernetesClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__, 
            static_folder='static',
            template_folder='api/templates')
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev_key_change_in_production')

# Change Jinja2 template delimiters to avoid conflicts with Vue.js
app.jinja_env.variable_start_string = '{['
app.jinja_env.variable_end_string = ']}'
app.jinja_env.block_start_string = '{%'
app.jinja_env.block_end_string = '%}'
app.jinja_env.comment_start_string = '{#'
app.jinja_env.comment_end_string = '#}'

# Initialize Socket.IO
socketio = SocketIO(app, cors_allowed_origins="*", ping_timeout=60, ping_interval=25, max_http_buffer_size=1024 * 1024, async_mode='threading', logger=True, engineio_logger=True)

# Initialize Kubernetes client
k8s_client = KubernetesClient()

@app.route('/')
def index():
    """Render the main application page"""
    return render_template('index.html')

@app.route('/api/contexts', methods=['GET'])
def get_contexts():
    """Get available Kubernetes contexts"""
    try:
        contexts = k8s_client.get_contexts()
        return jsonify(contexts)
    except Exception as e:
        logger.error(f"Error getting contexts: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/context', methods=['POST'])
def set_context():
    """Set current Kubernetes context"""
    try:
        data = request.json
        context_name = data.get('context')
        if not context_name:
            return jsonify({"error": "Context name is required"}), 400
        
        k8s_client.set_context(context_name)
        return jsonify({"status": "success"})
    except Exception as e:
        logger.error(f"Error setting context: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/namespaces', methods=['GET'])
def get_namespaces():
    """Get available namespaces in the current context"""
    try:
        namespaces = k8s_client.get_namespaces()
        return jsonify(namespaces)
    except Exception as e:
        logger.error(f"Error getting namespaces: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/pods', methods=['GET'])
def get_pods():
    """Get pods in the specified namespace"""
    try:
        namespace = request.args.get('namespace', 'default')
        pods = k8s_client.get_pods(namespace)
        return jsonify(pods)
    except Exception as e:
        logger.error(f"Error getting pods: {e}")
        return jsonify({"error": str(e)}), 500

@socketio.on('connect')
def handle_connect():
    """Handle client connection"""
    logger.info('Client connected')
    socketio.emit('test_event', {'message': 'Connection test successful'})

@socketio.on('disconnect')
def handle_disconnect():
    """Handle client disconnection"""
    logger.info('Client disconnected')

@socketio.on('start_logs')
def handle_start_logs(data):
    """Start streaming logs for a pod"""
    namespace = data.get('namespace', 'default')
    pod_name = data.get('pod')
    container = data.get('container')
    tail_lines = data.get('tail_lines', 100)
    
    if not pod_name:
        return
    
    try:
        # Send a test log to verify frontend is working
        test_log = {
            "pod": pod_name,
            "namespace": namespace,
            "container": container,
            "message": f"Starting log stream for {pod_name}...",
            "timestamp": None
        }
        socketio.emit('log_update', test_log)
        logger.info(f"Sent test log to client for pod {pod_name}")
        
        # Start the actual log stream
        k8s_client.stream_pod_logs(
            namespace, 
            pod_name, 
            container, 
            tail_lines, 
            socketio
        )
    except Exception as e:
        logger.error(f"Error streaming logs: {e}")
        socketio.emit('error', {'message': str(e)})

@socketio.on('stop_logs')
def handle_stop_logs(data):
    """Stop streaming logs"""
    pod_name = data.get('pod')
    if pod_name:
        k8s_client.stop_log_stream(pod_name)

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    
    logger.info(f"Starting k8s-pretty-logger on port {port}")
    socketio.run(app, host='0.0.0.0', port=port, debug=debug) 