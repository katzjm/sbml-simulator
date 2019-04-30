import functools
import roadrunner as rr
import sbnw
import socket

# from flask_socketio import SocketIO, emit
from flask import (
	Blueprint, flash, g, redirect, render_template, request, session, url_for, jsonify, current_app
)

bp = Blueprint('sim', __name__)

def setmodeldrag(nid, dx, dy):
	for node in current_app.model.network.nodes:
		if node.id == nid:
			node.unlock()
			node.centroid.x += dx
			node.centroid.y += dy
			print('1 ' + str(node.centroid))
		node.lock()
	current_app.model.network.autolayout()
	for node in current_app.model.network.nodes:
		if node.id == nid:
			print('2' + str(node.centroid))

def setmodel(width, height, gravity=0, stiffness=50):
	current_app.model = sbnw.loadsbml(current_app.sbml)
	if not current_app.model.network.haslayout():
		current_app.model.network.randomize(0, 0, width, height)
		current_app.model.network.autolayout(k=stiffness, grav=gravity)
	current_app.model.network.fitwindow(0, 0, width, height)

def getLayout():
	layout = {
		'nodes': list(),
		'edges': None,
		'sbml': current_app.model.getsbml(),
	}

	for node in current_app.model.network.nodes:
		layout['nodes'].append({
			'id': node.id,
			'height': node.height,
			'width': node.width,
			'centroid': tuple(node.centroid),
		})

	edges = list()
	r = rr.RoadRunner(current_app.sbml)
	for rid, rxn in zip(r.model.getReactionIds(), current_app.model.network.rxns):
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
			'id': rid,
			'curves': curves,
		})
	layout['edges'] = edges

	return layout

@bp.route('/', methods=('GET', 'POST'))
def runsim():
	return render_template('index.html')


@bp.route('/run', methods=['POST'])
def run():
	start = float(request.form['start'])
	end = float(request.form['end'])
	steps = int(request.form['steps'])

	current_app.r.reset()
	ndresult = current_app.r.simulate(start, end, points=steps)
	resultdata = ndresult.transpose().tolist()
	data = dict()
	for i, name in enumerate(ndresult.colnames):
		data[name] = resultdata[i]

	return jsonify({
		'data': data,
		'params': current_app.r.model.getGlobalParameterIds() 
				+ current_app.r.model.getBoundarySpeciesIds(),
	})

@bp.route('/upload', methods=['POST'])
def upload():
	sbmlfile = request.files['sbml']
	current_app.sbml = sbmlfile.read().decode('UTF-8')
	current_app.r = rr.RoadRunner(current_app.sbml)
	current_app.r.timeCourseSelections += current_app.r.getIds(rr.SelectionRecord.REACTION_RATE)
	
	height = int(request.form['height'])
	width = int(request.form['width'])
	setmodel(width, height)
	return jsonify({ 'layout': getLayout() })

@bp.route('/redraw', methods=['POST'])
def redraw():
	height = int(request.form['height'])
	width = int(request.form['width'])
	setmodel(width, height)
	return jsonify({ 'layout': getLayout() })

@bp.route('/drag', methods=['POST'])
def drag():
	nid = request.form['id']
	dx = float(request.form['dx'])
	dy = float(request.form['dy'])
	setmodeldrag(nid, dx, dy)
	return jsonify({ 'layout': getLayout() })

@bp.route('/get_param', methods=['POST'])
def getparam():
	return jsonify(current_app.r[request.form['param']])

@bp.route('/set_param', methods=['POST'])
def setparam():
	current_app.r[request.form['param']] = float(request.form['value'])
	return '200'
