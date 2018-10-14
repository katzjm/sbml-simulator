import functools
import roadrunner

from flask import (
	Blueprint, flash, g, redirect, render_template, request, session, url_for
)

bp = Blueprint('sim', __name__)

@bp.route('/', methods=('GET', 'POST'))
def run_sim():
	result = None
	if request.method == 'POST':
		sbml = request.form['sbml']
		error = None

		if not sbml:
			error = 'Nothing passed in'

		if error:
			flash(error)

		rr = roadrunner.RoadRunner(sbml)
		result = rr.simulate(0, 10, 100)
		print(result)
	return render_template('index.html', result=result)

