import os
from flask import Flask, current_app, session
from flask_socketio import SocketIO, emit
from flask_session import Session
from . import sim
import time
import gevent
import random

def create_app(test_config=None):
	app = Flask(__name__, instance_relative_config=True)
	app.config.from_mapping(
		SECRET_KEY='dev{}'.format(random.randint(0, 1e9)),
		SESSION_TYPE='filesystem'
	)

	if test_config:
		app.config.from_mapping(test_config)
	else:
		app.config.from_pyfile('config.py', silent=True)

	try:
		os.makedirs(app.instance_path)
	except OSError:
		pass

	app.register_blueprint(sim.bp)
	app.add_url_rule('/', endpoint='index')
	app.add_url_rule('/upload', endpoint='index')
	app.add_url_rule('/redraw', endpoint='index')

	return app

app = create_app()
socketio = SocketIO(app, manage_session=False)
sess = Session(app)

running = gevent.event.Event()
running.set()
done = gevent.event.Event()
def worker(simTime, userData):
	with app.app_context():
		while not done.is_set():
			gevent.sleep(userData['frequency'])
			if (running.is_set()):
				simTime = userData['r'].oneStep(simTime, userData['timestep'])
				realTime = time.time()
				response = { name: amt for name, amt 
					in zip(userData['r'].timeCourseSelections, userData['r'].getSelectedValues()) }
				socketio.emit('response', response)

@socketio.on('pause')
def pause():
	if (running.is_set()):
		running.clear()
	else:
		running.set()

@socketio.on('end')
def end():
	running.set()
	done.set()

@socketio.on('start')
def start(json):
	with app.app_context():
		simTime = int(json['start'])
		done.clear()
		userData = app.config[session.sid]
		userData['r'].reset()
		gevent.spawn(worker, simTime, userData)

if __name__ == '__main__':
	sess.init_app(app)
	socketio.run(app, debug=True, port=80, host='0.0.0.0')