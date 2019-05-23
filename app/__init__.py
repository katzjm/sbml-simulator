import os
from flask import Flask, current_app
from flask_socketio import SocketIO, emit
from . import sim
import time
import threading
import logging

def create_app(test_config=None):
	app = Flask(__name__, instance_relative_config=True)
	app.config.from_mapping(
		SECRET_KEY='dev'
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

	app.config['sbml'] = None
	app.config['r'] = None
	
	return app

app = create_app()
socketio = SocketIO(app)

running = threading.Event()
running.set()
done = threading.Event()
def worker(simTime, frequency, timestep):
	with app.app_context():
		realTime = time.time()
		while not done.is_set():
			if (running.is_set()):
				if time.time() - realTime >= frequency:
					simTime = app.config['r'].oneStep(simTime, timestep)
					realTime = time.time()
					response = { name: amt for name, amt in zip(app.config['r'].timeCourseSelections, app.config['r'].getSelectedValues()) }
					print(response)
					socketio.emit('response', response)
		done.clear()

@socketio.on('pause')
def pause():
	running.clear()

@socketio.on('continue')
def unpause():
	running.set()

@socketio.on('end')
def end():
	running.set()
	done.set()

@socketio.on('start')
def start(json):
	simTime = int(json['start'])
	frequency = int(json['frequency'])
	timestep = int(json['stepSize'])

	app.config['r'].reset()
	threading.Thread(target=worker, args=(simTime, frequency, timestep)).start()

if __name__ == '__main__':
	socketio.run(app, debug=True, port=80, host='0.0.0.0')