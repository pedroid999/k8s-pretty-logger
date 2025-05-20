# tests/conftest.py
import pytest
from app import app as flask_app
from app import socketio as app_socketio

@pytest.fixture
def app():
    yield flask_app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def socketio_client(app, client): # client fixture ensures app context
    return app_socketio.test_client(app, flask_test_client=client)
