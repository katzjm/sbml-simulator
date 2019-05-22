from app import create_app
from flask_socketio import SocketIO

app = create_app()
socketio = SocketIO(app)

if __name__ == '__main__':
	socketio.run(app, host='0.0.0.0', port=8000)