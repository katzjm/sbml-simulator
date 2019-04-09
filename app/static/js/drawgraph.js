(function() {
	"use strict";

	window.addEventListener("load", main);
	let graphCanvas;
	let chartCanvas;
	let start;
	let end;
	let stepSize;
	let steps;
	let frequency;
	let socket;

	function checkStatus(response) {
		if (response.status >= 200 && response.status < 300) {
			return response.text();
		} else {
			return response.text().then(Promise.reject.bind(Promise));
		}
	}

	function getRandomColor() {
		const characters = "0123456789ABCDEF";
		let color = "#"
		for (let i = 0; i < 6; i++) {
			color += characters[Math.floor(Math.random() * characters.length)];
		}
		return color;
	}

	class Shape {
		constructor (defaultColor, selectColor) {
			this.defaultColor = defaultColor;
			this.selectColor = selectColor;
			this.textColor = 'black';
			this.color = this.defaultColor;
			this.isSelected = false;
			this.isPlotted = false;
		}

		contains(ctx, mx, my) {
			const pixelColor1 = ctx.getImageData(mx , my, 1, 1).data;

			const oldColor = this.color;
			const oldTextColor = this.textColor;
			this.color = 'rgb(123, 123, 123)';
			this.textColor = 'rgb(123, 123, 123)';
			this.draw(ctx);
			const pixelColor2 = ctx.getImageData(mx , my, 1, 1).data;

			this.color = oldColor;
			this.textColor = oldTextColor;
			this.draw(ctx);

			for (let i = 0; i < 3; i++) {
				if (pixelColor1[i] != pixelColor2[i]) {
					return true;
				}
			}
			return false;
		}

		select() {
			this.isSelected = true;
			this.color = this.selectColor;
		}

		deselect() {
			this.isSelected = false;
			this.color = this.defaultColor;
		}
	}

	class Node extends Shape {
		constructor(nodeJSON) {
			super('skyblue', 'green');
			this.textColor = 'black';
			this.id = nodeJSON['id'];
			this.x = nodeJSON['centroid'][0] - nodeJSON['width'] / 2;
			this.y = nodeJSON['centroid'][1] - nodeJSON['height'] / 2;
			this.width = nodeJSON['width'];
			this.height = nodeJSON['height'];
		}

		draw(ctx) {
			ctx.fillStyle = this.color;
			ctx.fillRect(this.x, this.y, this.width, this.height);
			ctx.fillStyle = this.textColor;
			ctx.textAlign = "center";
			ctx.font = this.height / 2  + "px sans-serif";
			ctx.fillText(this.id, this.x + this.width / 2, this.y + 3 * this.height / 4, this.width);
		}

		drag(dx, dy) {
			this.x += dx;
			this.y += dy;
		}
	}

	class Curve extends Shape {
		constructor(curveJSON) {
			super('black', 'green');
			const bezier = curveJSON['bezier'];
			this.startx = bezier['start'][0];
			this.starty = bezier['start'][1];
			this.cp1x = bezier['cp1'][0];
			this.cp1y = bezier['cp1'][1];
			this.cp2x = bezier['cp2'][0];
			this.cp2y = bezier['cp2'][1];
			this.endx = bezier['end'][0];
			this.endy = bezier['end'][1];
			this.type = curveJSON['type'];
			this.arrow = curveJSON['arrow'];
		}

		draw(ctx) {
			ctx.fillStyle = this.color;
			ctx.strokeStyle = this.color;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(this.startx, this.starty);
			ctx.bezierCurveTo(
				this.cp1x, this.cp1y,
				this.cp2x, this.cp2y,
				this.endx, this.endy
			);
			ctx.stroke();

			if (this.arrow.length !== 0) {
				const start = this.arrow[0];
				ctx.beginPath();
				ctx.moveTo(start[0], start[1]);
				for (let i = 1; i < this.arrow.length; i++) {
					const point = this.arrow[i];
					ctx.lineTo(point[0], point[1]);
				}
				ctx.fill();
			}
		}

		drag(dx, dy) {
			this.startx += dx;
			this.cp1x += dx;
			this.cp2x += dx;
			this.endx += dx;

			this.starty += dy;
			this.cp1y += dy;
			this.cp2y += dy;
			this.endy += dy;

			this.arrow.forEach(pt => {
				pt[0] += dx;
				pt[1] += dy;
			});
		}
	}

	class HyperEdge extends Shape {
		constructor(curves) {
			super('black', 'green');
			if (curves[0] instanceof Curve) {
				this.curves = curves;
			} else {
				this.curves = curves.map(c => new Curve(c));
			}
		}

		draw(ctx) {
			this.curves.forEach(curve => curve.draw(ctx));
		}

		drag(dx, dy) {
			this.curves.forEach(curve => curve.drag(dx, dy));
		}

		contains(ctx, mx, my) {
			for (let curve of this.curves) {
				if (curve.contains(ctx, mx, my)) {
					return true;
				}
			}
			return false;
		}

		select() {
			super.select();
			this.curves.forEach(curve => curve.select());
		}

		deselect() {
			super.deselect();
			this.curves.forEach(curve => curve.deselect());
		}
	}

	class Canvas {
		constructor(canvas) {
			this.canvas = canvas;
			this.ctx = canvas.getContext('2d');
		}

		set height(newHeight) {
			this.canvas.height = newHeight;
		}

		set width(newWidth) {
			this.canvas.width = newWidth;
		}

		get height() {
			return this.canvas.height;
		}

		get width() {
			return this.canvas.width;
		}
	}

	class ChartCanvas extends Canvas {
		constructor(canvas) {
			super(canvas);
			this.data = {};
			this.config = {
				type: 'line',
				options: {
					repsponsive: true,
					title: {
						display: true,
						text: 'Example Chart',
					},
					tooltips: {
						mode: 'index',
						intersect: false,
					},
					scales: {
						xAxes: [{
							display: true,
							scaleLabel: {
								display: true,
								labelString: 'Time',
							}
						}],
						yAxes: [{
							display: true,
							scaleLabel: {
								display: true,
								labelString: 'Concentration',
							}
						}]
					}
				}
			}
			this.chart = new Chart(this.ctx, this.config);
		}

		loadData(data, time) {
			this.data = data;
			this.chart.data.labels = time;
		}

		addDataPoint(data, time) {
			this.chart.data.labels.push(time);
			if (Object.keys(this.data).length === 0) {
				Object.keys(data).forEach( label => {
					this.data[label] = [0, data[label]];
				});
			} else {
				Object.keys(this.data).forEach( label => this.data[label].push(data[label]) );
			}
			console.log('aDP', this.data);
		}

		clearCanvas() {
			this.data = {};
			this.chart.data = [];
			this.chart.update();
		}

		clearData() {
			this.data = {};
			this.chart.data = [];
		}

		clearPlot() {
			this.chart.data = [];
			this.chart.update();
		}

		replot() {
			for (let config of this.chart.data.datasets) {
				config.data = this.data[config.label];
				console.log('r', config, this.data);
			}
			this.chart.update();
		}

		plotDataset(label) {
			if (!this.chart.data.datasets.some(config => config.label == label)) {
				console.log('pD', this.chart.data.datasets);
				this.chart.data.datasets.push(this.getDatasetConfig(label, this.data[label]));
				this.chart.update();
				this.show();		
			}
		}

		hideDataset(label) {
			const index = this.chart.data.datasets.findIndex((config, index, arr) => {
				return config.label == label;
			});
			if (index !== -1) {
				this.chart.data.datasets.splice(index, 1);
				this.chart.update();
			}
			if (!this.chart.data.datasets.length) {
				this.hide();
			}
		}

		hideAllDatasets() {
			this.chart.data.datasets = [];
			this.chart.update();
			this.hide();
		}

		plotAllDatasets() {
			this.chart.data.datasets = [];
			for (let label in this.data) {
				this.chart.data.datasets.push(this.getDatasetConfig(label, this.data[label]));
			}
			this.chart.update();
			this.show();
		}

		hide() {
			this.canvas.style.height = '0px';
		}

		show() {
			this.canvas.style.height = '';
		}

		getDatasetConfig(label, data) {
			const color = getRandomColor();
			return {
				label: label,
				data: data,
				backgroundColor: color,
				borderColor: color,
				fill: false,
				pointRadius: 1,
				pointHoverRadius: 5,
			};
		}

		isPlotted(label) {
			return this.chart.data.datasets.some(config => config.label == label);
		}
	}

	class GraphCanvas extends Canvas {
		constructor(canvas) {
			super(canvas);
			this.shapes = [];
			this.drawInterval = 30;
			this.valid = false;
			this.panning = false;
			this.originX = 0;
			this.originY = 0;
			this.scale = 1;
			this.selection = [];
			this.selectPoint = {};
			setInterval(() => this.draw(), this.drawInterval);

			canvas.addEventListener("mousedown", e => {
				const simpleMouse = this.getSimpleMousePos(e);
				if (document.getElementById('select').checked) {
					if (!e.shiftKey) {
						this.clearSelection();
					}
					for (let shape of this.shapes) {																																	
						if (shape.contains(this.ctx, simpleMouse.x, simpleMouse.y)) {
							shape.isSelected ? this.deselectShape(shape) : this.selectShape(shape);
							break;
						}
					}
					this.panning = false;
				} else if (document.getElementById('plot').checked) {
					if (!e.shiftKey) {
						chartCanvas.hideAllDatasets();
					}
					let mouseOnGraph = false;
					for (let shape of this.shapes) {																																	
						if (shape.contains(this.ctx, simpleMouse.x, simpleMouse.y)) {
							if (shape instanceof Node) {
								chartCanvas.isPlotted(shape.id) ? chartCanvas.hideDataset(shape.id) : chartCanvas.plotDataset(shape.id);
							}
							mouseOnGraph = true;
							break;
						}
					}
					if (!mouseOnGraph) {
						const scaledMouse = this.getScaledMousePos(e);
						this.panOffsetX = scaledMouse.x;
						this.panOffsetY = scaledMouse.y;
						this.panning = true;
					}
				}
				this.valid = false;
			}, true);

			canvas.addEventListener("mousemove", e => {
				if (this.panning) {
					const mouse = this.getScaledMousePos(e);
					const dx = mouse.x - this.panOffsetX;
					const dy = mouse.y - this.panOffsetY;
					this.panOffsetX = mouse.x;
					this.panOffsetY = mouse.y;					
					this.ctx.translate(dx, dy);
					this.originX -= dx;
					this.originY -= dy;
					this.valid = false;
				}
			}, true);

			canvas.addEventListener("mouseup", e => {
				this.panning = false;
			}, true);

			canvas.addEventListener("mouseout", e => {
				this.panning = false;
			}, true);

			canvas.addEventListener("wheel", e => {
				e.preventDefault();
				const mouse = this.getScaledMousePos(e);
				const zoom = 1 + e.deltaY / 240;
				this.ctx.translate(this.originX, this.originY);
				this.ctx.scale(zoom, zoom);
				this.ctx.translate(
				    -( mouse.x + this.originX - mouse.x / zoom ),
				    -( mouse.y + this.originY - mouse.y / zoom )
				);
				this.originX = mouse.x + this.originX - mouse.x / zoom;
				this.originY = mouse.y + this.originY - mouse.y / zoom;
				this.scale *= zoom;
				this.valid = false;
			}, true);
		}

		addShape(shape) {
			this.shapes.push(shape);
			this.valid = false;			
		}

		getSimpleMousePos(e) {
			const rect = this.canvas.getBoundingClientRect();
			return { 
				x: e.pageX - rect.x,
				y: e.pageY - rect.y
			};
		}

		getScaledMousePos(e) {
			const mouse = this.getSimpleMousePos(e);
			return { x: mouse.x / this.scale, y: mouse.y / this.scale };
		}

		getTransformedMousePos(e) {
			const mouse = this.getScaledMousePos(e);
			return { x: mouse.x + this.originX, y: mouse.y + this.originY };
		}

		clear() {
			this.shapes = [];
			this.valid = false;
		};

		draw() {
			if (!this.valid) {	
				this.ctx.clearRect(this.originX, this.originY, this.canvas.width / this.scale, this.canvas.height / this.scale);
				this.shapes.forEach(shape => shape.draw(this.ctx));
				this.valid = true;
			}
		}

		selectAllShapes() {
			this.shapes.forEach(shape => this.selectShape(shape));	
			this.valid = false;		
		}

		clearSelection() {
			this.selection.forEach(shape => shape.deselect());
			this.selection = [];
			this.valid = false;
		}

		selectShape(shape) {
			shape.select();
			this.selection.push(shape);
			this.valid = false;
		}

		deselectShape(shape) {
			shape.deselect();
			this.selection.splice(this.selection.indexOf(shape), 1);
			this.valid = false;
		}
	}

	function postToServer(url, responseHandler, args) {
		const formData = new FormData();
		Object.keys(args).forEach( key => formData.append(key, args[key]));

		const init = {
			method: "POST",
			body: formData,
		};

		fetch(url, init)
			.then(checkStatus)
			.then(JSON.parse)
			.then(responseHandler)
			.catch(console.log);
	}

	function runSimulation(resultFunction) {
		const args = { 'start': start, 'end': end, 'steps': steps };
		postToServer('run', resultFunction, args);
	}

	function startSimulation() {
		const args = { 'start': start, 'frequency': frequency, 'stepSize': stepSize };
		socket = io.connect('http://localhost:5000');
		socket.on('connect', () => {
			console.log('connected!');
			socket.emit('start', args)
		});
		socket.on('response', (data) => {
			chartCanvas.addDataPoint(data, data['time']);
			chartCanvas.replot();
		});
	}

	function handleLayoutJSON(json){
		const layout = json['layout'];
		const nodes = layout['nodes'];
		const edges = layout['edges'];

		document.getElementById('redraw-form').style.display = 'inline';
		document.getElementById('download-box').style.display = 'block';
		let downloadLink = document.getElementById('sbml-download');
		downloadLink.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(json['sbml']);

		graphCanvas.clear();
		edges.forEach(edge => graphCanvas.addShape(new HyperEdge(edge)));
		nodes.forEach(node => graphCanvas.addShape(new Node(node)));
	}

	function handleRunOutput(json) {
		const result = json['result'];
		chartCanvas.loadData(result['data'], result['time']);

		document.getElementById('parameter-menu').style.display = 'block';
		const paramList = document.getElementById('parameter-list');
		for (let i = paramList.options.length - 1; i >= 0; i--) {
			paramList.remove(i)
		}

		for (let param of json['params']) {
			const option = document.createElement('option');
			option.addEventListener('click', handleParamSelection);
			option.value = param;
			option.innerHTML = param;
			paramList.appendChild(option);
		}
	}

	function getSliderCreator(param) {
		return (value) => {
			const container = document.createElement('li');
			const valueLabel = document.createElement('label');
			const valueControl = document.createElement('input');
			const sliderContainer = document.createElement('div');
			const minControl = document.createElement('input'); 
			const slider = document.createElement('input');
			const maxControl = document.createElement('input');
			const stepsLabel = document.createElement('label');
			const stepControl = document.createElement('input');

			container.id = param;
			container.class = 'slider';

			valueLabel.innerHTML = param + ' = ';
			valueControl.type = 'number';
			valueControl.min = 0;
			valueControl.step = 0.01;
			valueControl.value = value;
			sliderContainer.style.display = 'block';

			minControl.value = 0;
			minControl.min = 0;
			minControl.style.float = 'left';
			minControl.addEventListener('change', (e) => {
				slider.min = minControl.value;
				if (minControl.value >= slider.value) {
					slider.value = minControl.value;
					slider.dispatchEvent(new Event('change'));
				}
				if (minControl.value > maxControl.value) {
					maxControl.value = minControl.value;
					maxControl.dispatchEvent(new Event('change'));
				}
			});
			slider.type = 'range';
			slider.value = value;
			slider.min = 0;
			slider.max = 2 * value;
			slider.step = 2 * value / 100;
			slider.style.float = 'left';
			slider.style.margin = '5px';
			slider.addEventListener('change', (e) => {
		 		const args = { 'param': param, 'value': slider.value };
				postToServer('set_param', () => { return null }, args);
				runSimulation( (json) => {
					const result = json['result'];
					chartCanvas.loadData(result['data'], result['time']);
					chartCanvas.replot();
				});
				valueControl.value = slider.value;
			});
			maxControl.value = 2 * value;
			maxControl.min = 0;
			maxControl.style.float = 'left';
			maxControl.addEventListener('change', (e) => {
				slider.max = maxControl.value;
				if (maxControl.value <= slider.value) {
					slider.value = maxControl.value;
					slider.dispatchEvent(new Event('change'));
				}
				if (minControl.value > maxControl.value) {
					minControl.value = maxControl.value;
					minControl.dispatchEvent(new Event('change'));
				}
			});

			document.getElementById('sliders').appendChild(container);
			container.appendChild(valueLabel);
			container.appendChild(valueControl);
			container.appendChild(sliderContainer);
			sliderContainer.appendChild(minControl);
			sliderContainer.appendChild(slider);
			sliderContainer.appendChild(maxControl);
		}
	}

	function handleParamSelection(e) {
		const param = e.target.text;
		const slider = document.getElementById(param);
		if (slider) {
			slider.parentNode.removeChild(slider);
		} else {
			const sliderCreator = getSliderCreator(param);
			postToServer('get_param', sliderCreator, { 'param': param });
		}
	}

	function uploadSBML(e) {
		e.preventDefault();
		const args = {
			'sbml': document.getElementById('file-select').files[0],
			'height': graphCanvas.height,
			'width': graphCanvas.width,
			'gravity': document.getElementById('gravity').value,
			'stiffness': document.getElementById('stiffness').value,
		}
		postToServer('upload', handleLayoutJSON, args);
	}

	function startOfflineSim(e) {
		e.preventDefault();
		start = document.getElementById('start-offline').value;
		end = document.getElementById('end-offline').value;
		steps = document.getElementById('step-offline').value;
		runSimulation(handleRunOutput);
	}

	function startOnlineSim(e) {
		e.preventDefault();
		start = document.getElementById('start-online').value;
		frequency = document.getElementById('frequency-online').value;
		stepSize = document.getElementById('step-online').value;
		startSimulation();
	}

	function handleRedrawButton(e) {
		e.preventDefault();
		const args = { 'height': graphCanvas.height, 'width': graphCanvas.width }
		postToServer('redraw', handleLayoutJSON, args);
	}

	function handleSelectAllButton() {
		if (document.getElementById('select').checked) {
			graphCanvas.selectAllShapes();
		} else if (document.getElementById('plot').checked) {
			chartCanvas.plotAllDatasets();
		}
	}

	function changeSimMode() {
		if (document.getElementById('offline').checked) {
			document.getElementById('offline-form').style.display = 'block';
			document.getElementById('online-form').style.display = 'none';
		} else {
			document.getElementById('offline-form').style.display = 'none';
			document.getElementById('online-form').style.display = 'block';
		}
	}

	function main() {
		graphCanvas = new GraphCanvas(document.getElementById('canvas'));
		graphCanvas.width = window.innerWidth / 2;
		graphCanvas.height = window.innerHeight;

		chartCanvas = new ChartCanvas(document.getElementById('chart'));
		chartCanvas.hide();

		const fileForm = document.getElementById('file-form');
		const offlineForm = document.getElementById('offline-form');
		const onlineForm = document.getElementById('online-form');
		const redrawForm = document.getElementById('redraw-form');
		const selectAllButton = document.getElementById('select-all');
		const simModeRadio = document.getElementById('sim-mode');
		fileForm.addEventListener("change", uploadSBML);
		offlineForm.addEventListener('submit', startOfflineSim);
		onlineForm.addEventListener('submit', startOnlineSim);
		redrawForm.addEventListener("submit", handleRedrawButton);
		selectAllButton.addEventListener('click', handleSelectAllButton);
		simModeRadio.addEventListener('change', changeSimMode);
	}
})();