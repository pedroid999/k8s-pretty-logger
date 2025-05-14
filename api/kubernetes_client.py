#!/usr/bin/env python
# -*- coding: utf-8 -*-

import threading
import time
import logging
from kubernetes import client, config, watch
from kubernetes.client.rest import ApiException

logger = logging.getLogger(__name__)

class KubernetesClient:
    """Client for interacting with Kubernetes API"""
    
    def __init__(self):
        """Initialize the Kubernetes client with local config"""
        try:
            # Load kube config from default location (~/.kube/config)
            config.load_kube_config()
            self.api_client = client.ApiClient()
            self.core_v1 = client.CoreV1Api(self.api_client)
            self.active_streams = {}
            self.current_context = None
            logger.info("Kubernetes client initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing Kubernetes client: {e}")
            raise
    
    def get_contexts(self):
        """Get available kubernetes contexts"""
        contexts = []
        try:
            # Try to get the contexts from the config
            contexts_data = config.list_kube_config_contexts()
            
            # If contexts_data is None, there are no contexts
            if contexts_data is None or len(contexts_data) < 2:
                logger.warning("No Kubernetes contexts found in config")
                return []
            
            available_contexts, active_context = contexts_data
            
            for ctx in available_contexts:
                contexts.append({
                    "name": ctx["name"],
                    "active": ctx["name"] == active_context["name"]
                })
            
            self.current_context = active_context["name"]
            return contexts
        except Exception as e:
            logger.error(f"Error listing contexts: {e}")
            raise
    
    def set_context(self, context_name):
        """Set the current kubernetes context"""
        try:
            # Using kubectl command via subprocess since kubernetes-client
            # doesn't provide a way to switch contexts programmatically
            import subprocess
            result = subprocess.run(
                ["kubectl", "config", "use-context", context_name],
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                raise Exception(f"Failed to set context: {result.stderr}")
            
            # Reload the kube config with the new context
            config.load_kube_config()
            self.api_client = client.ApiClient()
            self.core_v1 = client.CoreV1Api(self.api_client)
            self.current_context = context_name
            
            logger.info(f"Context switched to {context_name}")
            return True
        except Exception as e:
            logger.error(f"Error setting context: {e}")
            raise
    
    def get_namespaces(self):
        """Get available namespaces in the current context"""
        try:
            namespaces = []
            ns_list = self.core_v1.list_namespace()
            
            for ns in ns_list.items:
                namespaces.append({
                    "name": ns.metadata.name,
                    "status": ns.status.phase
                })
            
            return namespaces
        except ApiException as e:
            logger.error(f"Error listing namespaces: {e}")
            raise
    
    def get_pods(self, namespace="default"):
        """Get pods in the specified namespace"""
        try:
            pods = []
            pod_list = self.core_v1.list_namespaced_pod(namespace)
            
            for pod in pod_list.items:
                # Extract container names and status
                containers = []
                
                # Get container statuses if available
                container_statuses = {}
                if pod.status.container_statuses:
                    for status in pod.status.container_statuses:
                        container_statuses[status.name] = {
                            "ready": status.ready,
                            "state": self._get_container_state(status)
                        }
                
                # Add all containers from pod spec
                for container in pod.spec.containers:
                    status_info = container_statuses.get(container.name, {"ready": False, "state": "Unknown"})
                    containers.append({
                        "name": container.name,
                        "ready": status_info["ready"],
                        "status": status_info["state"]
                    })
                
                # Build pod info
                pods.append({
                    "name": pod.metadata.name,
                    "namespace": pod.metadata.namespace,
                    "status": pod.status.phase,
                    "containers": containers,
                    "creation_timestamp": pod.metadata.creation_timestamp.strftime(
                        "%Y-%m-%d %H:%M:%S UTC"
                    ) if pod.metadata.creation_timestamp else None
                })
            
            return pods
        except ApiException as e:
            logger.error(f"Error listing pods: {e}")
            raise
        except Exception as e:
            logger.error(f"Error getting pods: {e}")
            raise
    
    def _get_container_state(self, container_status):
        """Get the state of a container from its status"""
        if container_status.state.running:
            return "Running"
        elif container_status.state.waiting:
            return f"Waiting: {container_status.state.waiting.reason}"
        elif container_status.state.terminated:
            return f"Terminated: {container_status.state.terminated.reason}"
        return "Unknown"
    
    def stream_pod_logs(self, namespace, pod_name, container=None, tail_lines=100, socketio=None):
        """Stream logs from a pod to the client via socketio"""
        if pod_name in self.active_streams:
            logger.info(f"Log stream for pod {pod_name} already active, stopping previous stream")
            self.stop_log_stream(pod_name)
        
        def log_streaming_thread():
            try:
                logger.info(f"Starting log stream for pod {pod_name} in namespace {namespace}" + 
                           (f", container {container}" if container else ""))
                
                w = watch.Watch()
                log_count = 0
                
                for log_line in w.stream(
                    self.core_v1.read_namespaced_pod_log,
                    name=pod_name,
                    namespace=namespace,
                    container=container,
                    tail_lines=tail_lines,
                    follow=True,
                    timestamps=True
                ):
                    if pod_name not in self.active_streams:
                        logger.info(f"Stream terminated for pod {pod_name} as it's no longer in active streams")
                        w.stop()
                        break
                    
                    log_count += 1
                    if log_count == 1:
                        logger.info(f"First log received for pod {pod_name}: {log_line[:100]}...")
                        print(f"DEBUG - Raw log line: {log_line}")
                    
                    if log_count % 100 == 0:
                        logger.info(f"Processed {log_count} log entries for pod {pod_name}")
                    
                    # For Spring Boot / Java log format
                    # Format: 2025-05-14T17:19:26.938Z INFO 1 --- [vitaly-secure-gateway] [ Thread-598] c.v.t.g.m.SendMessageToTopicService : Message
                    timestamp = None
                    message = log_line
                    
                    try:
                        # Find the timestamp (always at the beginning in ISO format)
                        if log_line and len(log_line) > 20:
                            # Simple approach: Find the timestamp and the message separator (" : ")
                            if "T" in log_line[:25] and "Z" in log_line[:30] and " : " in log_line:
                                # Extract timestamp - it's at the beginning until space
                                space_pos = log_line.find(" ", 20)  # Find first space after timestamp
                                if space_pos > 0:
                                    timestamp = log_line[:space_pos]
                                    
                                    # Find the actual message (after the " : " separator)
                                    colon_pos = log_line.find(" : ")
                                    if colon_pos > 0:
                                        message = log_line[colon_pos + 3:]  # Skip the " : " part
                                    else:
                                        # If no message separator, use everything after timestamp
                                        message = log_line[space_pos:].strip()
                            else:
                                # Fallback for other formats - use the first 26 chars as timestamp if it looks like ISO
                                if "T" in log_line[:15] and ("Z" in log_line[:30] or "+" in log_line[:30]):
                                    for i in range(20, 30):
                                        if i < len(log_line) and (log_line[i] == 'Z' or log_line[i] == '+'):
                                            timestamp = log_line[:i+1]
                                            message = log_line[i+1:].strip()
                                            break
                    except Exception as e:
                        logger.debug(f"Error parsing log format: {e}, using full line as message")
                        # If parsing fails, keep the full line as the message
                        timestamp = None
                        message = log_line
                    
                    log_data = {
                        "pod": pod_name,
                        "namespace": namespace,
                        "container": container,
                        "message": message,
                        "timestamp": timestamp
                    }
                    
                    if socketio:
                        print(f"Emitting log: timestamp={timestamp}, message_length={len(message) if message else 0}")
                        socketio.emit('log_update', log_data)
                        if log_count % 50 == 0:
                            print(f"Emitted {log_count} logs so far")
                
                if log_count == 0:
                    logger.warning(f"No logs received for pod {pod_name} in namespace {namespace}" +
                                  (f", container {container}" if container else ""))
                
                logger.info(f"Log stream for {pod_name} ended with {log_count} total log entries")
            except Exception as e:
                logger.error(f"Error streaming logs for pod {pod_name}: {e}")
                if socketio:
                    socketio.emit('error', {'message': str(e)})
                if pod_name in self.active_streams:
                    del self.active_streams[pod_name]
        
        # Start the log streaming in a separate thread
        thread = threading.Thread(target=log_streaming_thread)
        thread.daemon = True
        self.active_streams[pod_name] = thread
        thread.start()
        logger.info(f"Log stream started for pod {pod_name}")
    
    def stop_log_stream(self, pod_name):
        """Stop an active log stream"""
        if pod_name in self.active_streams:
            # Mark for termination, the thread will exit at next iteration
            del self.active_streams[pod_name]
            logger.info(f"Log stream for pod {pod_name} marked for termination")
            return True
        return False 