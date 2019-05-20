import os
from flask import Flask
from flask_socketio import SocketIO, emit
import sim
import time

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

	app.sbml = None
	app.r = None
	
	return app

app = create_app()
socketio = SocketIO(app)

@socketio.on('start')
def start(json):
	simTime = int(json['start'])
	frequency = int(json['frequency'])
	timestep = int(json['stepSize'])

	realTime = time.time()
	while True:
		if time.time() - realTime >= frequency:
			simTime = app.r.oneStep(simTime, timestep)
			realTime = time.time()
			response = { name: amt for name, amt in
				zip(app.r.timeCourseSelections, app.r.getSelectedValues())}
			emit('response', response)

if __name__ == '__main__':
	socketio.run(app, debug=True, port=80)