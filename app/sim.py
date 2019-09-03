import functools
import roadrunner as rr
import sbnw
import socket
import uuid

from flask import (
	Blueprint, render_template, request, session, jsonify, current_app
)

bp = Blueprint('sim', __name__)

def setmodeldrag(nid, dx, dy):
	userData = current_app.config[session.sid]
	for node in userData['model'].network.nodes:
		if node.id == nid:
			node.unlock()
			node.centroid = sbnw.point(node.centroid.x + dx, node.centroid.y + dy)
		node.lock()
	userData['model'].network.recenterjunct()

def setmodel(width, height, gravity=0, stiffness=20):
	userData = current_app.config[session.sid]
	userData['model'] = sbnw.loadsbml(userData['sbml'])
	if not userData['model'].network.haslayout():
		userData['model'].network.randomize(5, 10, width - 5, height - 10)
		userData['model'].network.autolayout(k=stiffness, grav=gravity)
	userData['model'].network.fitwindow(5, 10, width - 5, height - 10)

def getLayout():
	userData = current_app.config[session.sid]
	layout = {
		'nodes': list(),
		'edges': None,
		'sbml': userData['model'].getsbml(),
	}

	nodes = userData['model'].network.nodes
	concentrations = userData['r'].model.getFloatingSpeciesConcentrations()
	rids = userData['r'].model.getReactionIds()
	rxns = userData['model'].network.rxns
	rxnrates = userData['r'].model.getReactionRates()

	for node in nodes:
		layout['nodes'].append({
			'id': node.id,
			'height': node.height,
			'width': node.width,
			'centroid': tuple(node.centroid),
			'value': userData['r'].getValue('[{}]'.format(node.id)),
			'boundary': node.id in userData['r'].model.getBoundarySpeciesIds(),
		})

	edges = list()
	for rid, rxn, rate in zip(rids, rxns, rxnrates):
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
				'rate': rate,
			})
		edges.append({
			'id': rid,
			'curves': curves,
			'value': rate,
		})
	layout['edges'] = edges

	return layout

@bp.route('/', methods=('GET', 'POST'))
def index():
	return render_template('index.html')


@bp.route('/run', methods=['POST'])
def run():
	start = float(request.form['start'])
	end = float(request.form['end'])
	steps = int(request.form['steps'])

	userData = current_app.config[session.sid]
	userData['r'].reset()
	ndresult = userData['r'].simulate(start, end, points=steps)
	resultdata = ndresult.transpose().tolist()
	data = dict()
	for i, name in enumerate(ndresult.colnames):
		data[name] = resultdata[i]
	return jsonify({
		'data': data,
		'params': userData['r'].model.getGlobalParameterIds(),
		'bounds': userData['r'].model.getBoundarySpeciesIds(),
		'comparts': userData['r'].model.getCompartmentIds(),
		'moieties': userData['r'].model.getConservedMoietyIds(),
	})

@bp.route('/upload', methods=['POST'])
def upload():
	sbmlfile = request.files['sbml']
	userData = current_app.config[session.sid]
	userData['sbml'] = sbmlfile.read().decode('UTF-8')
	userData['r'] = rr.RoadRunner(userData['sbml'])
	userData['r'].timeCourseSelections += userData['r'].getIds(rr.SelectionRecord.REACTION_RATE)
	userData['r'].timeCourseSelections += userData['r'].getIds(rr.SelectionRecord.BOUNDARY_CONCENTRATION)
	
	height = int(request.form['height'])
	width = int(request.form['width'])
	gravity = float(request.form['gravity'])
	stiffness = int(request.form['stiffness'])
	setmodel(width, height, gravity=gravity, stiffness=stiffness)
	return jsonify({
		'layout': getLayout(),
		'params': userData['r'].model.getGlobalParameterIds(),
		'bounds': userData['r'].model.getBoundarySpeciesIds(),
		'comparts': userData['r'].model.getCompartmentIds(),
		'moieties': userData['r'].model.getConservedMoietyIds(),
	})

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
	userData = current_app.config[session.sid]
	return jsonify(userData['r'][request.form['param']])

@bp.route('/set_param', methods=['POST'])
def setparam():
	userData = current_app.config[session.sid]
	userData['r'][request.form['param']] = float(request.form['value'])
	return '200'

@bp.route('/set_sim_param', methods=['POST'])
def setsimparam():
	userData = current_app.config[session.sid]
	userData[request.form['param']] = float(request.form['value'])
	return '200'

@bp.route('/reset', methods=['POST'])
def reset():
	userData = current_app.config[session.sid]
	userData['sbml'] = None
	userData['r'] = None
	userData['frequency'] = 1
	userData['timestep'] = 2
	return '200'

@bp.route('/load', methods=['POST'])
def load():
	current_app.config[session.sid] = {};
	return '200'
