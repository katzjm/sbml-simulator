import functools
import roadrunner as rr
from io import StringIO
import numpy

from flask import (
	Blueprint, flash, g, redirect, render_template, request, session, url_for, json
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
	sbml = request.files['sbml']
	r = rr.load(sbml)

	model = dict()
	model['nodes'] = r.getBoundarySpeciesIds()
	


