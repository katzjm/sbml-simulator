import functools
import roadrunner as rr
import sbnw
import socket

# import matplotlib; matplotlib.use('TkAgg')
# from libsbml_draw.model.sbml_layout import SBMLlayout

# from flask_socketio import SocketIO, emit
from flask import (
	Blueprint, flash, g, redirect, render_template, request, session, url_for, jsonify, current_app
)

bp = Blueprint('sim', __name__)

def setmodeldrag(nid, dx, dy):
	print(current_app.config['SECRET_KEY'])
	for node in current_app.config['model'].network.nodes:
		if node.id == nid:
			node.unlock()
			node.centroid = sbnw.point(node.centroid.x + dx, node.centroid.y + dy)
		node.lock()
	current_app.config['model'].network.recenterjunct()

def setmodel(width, height, gravity=0, stiffness=20):
	current_app.config['model'] = sbnw.loadsbml(current_app.config['sbml'])
	# current_app.zz = SBMLlayout(current_app.config['sbml'])
	# current_app.zz.setLayoutAlgorithmOptions(grav=gravity, k=stiffness, prerandom=1)
	# current_app.zz.regenerateLayoutAndNetwork()
	if not current_app.config['model'].network.haslayout():
		current_app.config['model'].network.randomize(5, 10, width - 5, height - 10)
		current_app.config['model'].network.autolayout(k=stiffness, grav=gravity)
	current_app.config['model'].network.fitwindow(5, 10, width - 5, height - 10)

def getLayout():
	layout = {
		'nodes': list(),
		'edges': None,
		# 'sbml': current_app.zz.getSBMLString(),
		'sbml': current_app.config['model'].getsbml(),
	}

	# for nid in current_app.zz.getNodeIds():
	# 	layout['nodes'].append({
	# 		'id': nid,
	# 		'height': current_app.zz.getNodeHeight(nid),
	# 		'width': current_app.zz.getNodeWidth(nid),
	# 		'centroid': current_app.zz.getNodeCentroid(nid),
	# 	})

	# edges = list()
	# for rid in current_app.zz.getReactionIds():
	# 	curves = list()
	# 	for curve in rxn.curves:
	# 		curveType = curve[4]
	# 		arrow = [tuple(point) for point in curve[5]]
	# 		curves.append({
	# 			'type': curveType,
	# 			'bezier': {
	# 				'start': tuple(curve[0]),
	# 				'cp1': tuple(curve[1]),
	# 				'cp2': tuple(curve[2]),
	# 				'end': tuple(curve[3]),
	# 			},
	# 			'arrow': arrow,
	# 		})
	# 	edges.append({
	# 		'id': rid,
	# 		'curves': curves,
	# 	})
	# layout['edges'] = edges

	nodes = current_app.config['model'].network.nodes
	concentrations = current_app.config['r'].model.getFloatingSpeciesConcentrations()
	rids = current_app.config['r'].model.getReactionIds()
	rxns = current_app.config['model'].network.rxns
	rxnrates = current_app.config['r'].model.getReactionRates()

	for node in nodes:
		layout['nodes'].append({
			'id': node.id,
			'height': node.height,
			'width': node.width,
			'centroid': tuple(node.centroid),
			'value': current_app.config['r'].getValue('[{}]'.format(node.id)),
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

	current_app.config['r'].reset()
	ndresult = current_app.config['r'].simulate(start, end, points=steps)
	resultdata = ndresult.transpose().tolist()
	data = dict()
	for i, name in enumerate(ndresult.colnames):
		data[name] = resultdata[i]

	return jsonify({
		'data': data,
		'params': current_app.config['r'].model.getGlobalParameterIds(),
		'bounds': current_app.config['r'].model.getBoundarySpeciesIds(),
		'comparts': current_app.config['r'].model.getCompartmentIds(),
		'moieties': current_app.config['r'].model.getConservedMoietyIds(),
	})

@bp.route('/upload', methods=['POST'])
def upload():
	sbmlfile = request.files['sbml']
	current_app.config['sbml'] = sbmlfile.read().decode('UTF-8')
	current_app.config['r'] = rr.RoadRunner(current_app.config['sbml'])
	current_app.config['r'].timeCourseSelections += current_app.config['r'].getIds(rr.SelectionRecord.REACTION_RATE)
	
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
	return jsonify(current_app.config['r'][request.form['param']])

@bp.route('/set_param', methods=['POST'])
def setparam():
	current_app.config['r'][request.form['param']] = float(request.form['value'])
	return '200'
