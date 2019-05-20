from app import create_app
from flask_socketio import SocketIO

import os; raise Exception(os.getcwd())
app = create_app()
socketio = SocketIO(app)

if __name__ == '__main__':
	socketio.run(app)