import functools
import roadrunner as rr
import sbnw
import socket

# from flask_socketio import SocketIO, emit
from flask import (
	Blueprint, flash, g, redirect, render_template, request, session, url_for, jsonify, current_app
)

bp = Blueprint('sim', __name__)

def getLayout(sbml, width, height, gravity, stiffness):
	model = sbnw.loadsbml(sbml)

	if not model.network.haslayout():
		model.network.randomize(0, 0, width, height)
		model.network.autolayout(k=stiffness, grav=gravity)
	model.network.fitwindow(0, 0, width, height)

	layout = {
		'nodes': list(),
		'edges': None,
		'sbml': model.getsbml(),
	}

	for node in model.network.nodes:
		layout['nodes'].append({
			'id': node.id,
			'height': node.height,
			'width': node.width,
			'centroid': tuple(node.centroid),
		})

	edges = list()
	rxnIds = rr.RoadRunner(sbml).model.getReactionIds()
	for i, rxn in enumerate(model.network.rxns):
		curves = list()
		for curve in rxn.curves:
			curveType = curve[4]
			arrow = [tuple(point) for point in curve[5]]
			curves.append({
				'type': curveType,
				'bezier': {
					'start': tuple(curve[0]),
					'cp1': tuple(curve[1]),
					'cp2': tuple(curve[2]),
					'end': tuple(curve[3]),
				},
				'arrow': arrow,
			})
		edges.append({
			'id': rxnIds[i],
			'curves': curves,
		})
	layout['edges'] = edges

	return layout

@bp.route('/', methods=('GET', 'POST'))
def run_sim():
	return render_template('index.html')

@bp.route('/upload', methods=['POST'])
def upload():
	sbmlfile = request.files['sbml']
	current_app.sbml = sbmlfile.read().decode('UTF-8')
	current_app.r = rr.RoadRunner(current_app.sbml)
	
	height = int(request.form['height'])
	width = int(request.form['width'])
	gravity = float(request.form['gravity'])	
	stiffness = float(request.form['stiffness'])

	return jsonify({ 
		'layout': getLayout(current_app.sbml, width, height, gravity, stiffness),
	})

@bp.route('/run', methods=['POST'])
def run():
	start = float(request.form['start'])
	end = float(request.form['end'])
	steps = int(request.form['steps'])

	current_app.r.reset()
	ndresult = current_app.r.simulate(start, end, points=steps)
	resultdata = ndresult.transpose().tolist()
	data = dict()
	time = None
	for i, name in enumerate(ndresult.colnames):
		if name == 'time':
			time = resultdata[i]
		else:
			data[name.strip('[]')] = resultdata[i]

	return jsonify({
		'result': { 'data': data, 'time': time },
		'params': current_app.r.model.getGlobalParameterIds() 
				+ current_app.r.model.getBoundarySpeciesIds(),
	})

@bp.route('/redraw', methods=['POST'])
def redraw():
	height = int(request.form['height'])
	width = int(request.form['width'])
	return jsonify(getLayout(session['sbml'], width, height));

@bp.route('/get_param', methods=['POST'])
def getparam():
	return jsonify(current_app.r[request.form['param']])

@bp.route('/set_param', methods=['POST'])
def setparam():
	current_app.r[request.form['param']] = float(request.form['value'])
	return '200'
