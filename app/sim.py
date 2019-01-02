import functools
import roadrunner as rr
import sbnw

from flask import (
	Blueprint, flash, g, redirect, render_template, request, session, url_for, jsonify
)

bp = Blueprint('sim', __name__)

@bp.route('/', methods=('GET', 'POST'))
def run_sim():
	result = "Nothing loaded"
	if request.method == 'POST':
		if 'load' in request.form:
			session['sbml'] = request.form['sbml']
		elif 'sbml' in session:
			result = rr.RoadRunner(session['sbml']).simulate(0, 10, 100)
		else:
			result = 'Load something first'
	return render_template('index.html', result=result)

def gethyperedges(curves):
	def find(data, p):
		if p != data[p]:
		        data[p] = find(data, data[p])
		return data[p]

	def union(data, i, j):
		pi, pj = find(data, i), find(data, j)
		if pi != pj:
			data[pi] = pj

	ends = dict()
	for curve in curves:
		end1 = curve['bezier']['start']
		end2 = curve['bezier']['end']
		ends[end1] = end1
		ends[end2] = end2
	for curve in curves:
		union(ends, curve['bezier']['start'], curve['bezier']['end'])

	edgeParents = dict()
	for curve in curves:
		edgeParent = find(ends, curve['bezier']['start'])
		if edgeParent not in edgeParents:
			edgeParents[edgeParent] = list()
		edgeParents[edgeParent].append(curve)

	return list(edgeParents.values())

def getLayout(sbml, width, height):
	model = sbnw.loadsbml(sbml)

	if not model.network.haslayout():
		model.network.randomize(0, 0, width, height)
		model.network.autolayout()
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

	curves = list()
	for reaction in model.network.rxns:
		for curve in reaction.curves:
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
	layout['edges'] = gethyperedges(curves)

	return layout

@bp.route('/upload', methods=['POST'])
def upload():
	sbmlfile = request.files['sbml']
	sbml = sbmlfile.read().decode('UTF-8')
	session['sbml'] = sbml;
	height = int(request.form['height'])
	width = int(request.form['width'])
	return jsonify(getLayout(sbml, width, height));

@bp.route('/redraw', methods=['POST'])
def redraw():
	height = int(request.form['height'])
	width = int(request.form['width'])
	return jsonify(getLayout(session['sbml'], width, height));

	


