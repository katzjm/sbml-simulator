import functools
import roadrunner as rr
from io import StringIO
import numpy
import tesbml
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

@bp.route('/upload', methods=['POST'])
def upload():
	sbmlfile = request.files['sbml']
	sbml = sbmlfile.read().decode('UTF-8')
	sbmldoc = tesbml.readSBMLFromString(sbml)
	sbmlmodel = sbmldoc.getModel()

	model = dict()
	model['nodes'] = list()
	model['edges'] = list()
	nodeid = 0
	ids = dict()
	for i, reacref in enumerate(sbmlmodel.getListOfReactions()):
		reaction = reacref.getId()
		if reaction not in ids:
			ids[reaction] = nodeid
			nodeid += 1
		model['nodes'].append({'id': ids[reaction], 'size': 0.5})
		for specref in reacref.getListOfReactants():
			species = specref.getSpecies()
			if species not in ids:
				model['nodes'].append({'id': nodeid, 'label': species})
				ids[species] = nodeid
				nodeid += 1
			model['edges'].append({'from': ids[species], 'to': ids[reaction]})
		for specref in reacref.getListOfProducts():
			species = specref.getSpecies()
			if species not in ids:
				model['nodes'].append({'id': nodeid, 'label': species})
				ids[species] = nodeid
				nodeid += 1
			model['edges'].append({'from': ids[reaction], 'to': ids[species], 'arrows': 'to'})

	return jsonify(model)

	


