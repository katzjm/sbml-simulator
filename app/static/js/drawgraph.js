(function() {
	"use strict";

	window.addEventListener("load", main);
	let myCanvas;

	function checkStatus(response) {
		if (response.status >= 200 && response.status < 300) {
			return response.text();
		} else {
			return response.text().then(Promise.reject.bind(Promise));
		}
	}

	class Shape {
		constructor (defaultColor, selectColor) {
			this.defaultColor = defaultColor;
			this.selectColor = selectColor;
			this.textColor = 'black';
			this.color = this.defaultColor;
			this.isSelected = false;
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
			ctx.lineWidth = 5;
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
			this.shapes = [];
			this.drawInterval = 30;
			this.valid = false;
			this.panning = false;
			this.originX = 0;
			this.originY = 0;
			this.scale = 1;
			this.selection = null;
			setInterval(() => this.draw(), this.drawInterval);

			canvas.addEventListener("mousedown", e => {
				const scaledMouse = this.getScaledMousePos(e);
				this.panOffsetX = scaledMouse.x;
				this.panOffsetY = scaledMouse.y;
				this.panning = true;
				this.valid = false;

				this.clearSelection();
				const simpleMouse = this.getSimpleMousePos(e);
				for (let shape of this.shapes) {																																			
					if (shape.contains(this.ctx, simpleMouse.x, simpleMouse.y)) {
						this.selectShapes(shape);
						break;
					}
				}
			}, true);

			canvas.addEventListener("mousemove", e => {
				if (this.panning) {
					const mouse = this.getScaledMousePos(e);
					const dx = mouse.x - this.panOffsetX;
					const dy = mouse.y - this.panOffsetY;
					this.panOffsetX = mouse.x;
					this.panOffsetY = mouse.y;
					if (this.selection) {
						this.selection.drag(dx, dy);
					} else {					
						this.ctx.translate(dx, dy);
						this.originX -= dx;
						this.originY -= dy;
					}
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

			canvas.addEventListener("click", e => {
				const mouse = this.getSimpleMousePos(e);
				for (let shape of this.shapes) {
					if (shape.contains(this.ctx, mouse.x, mouse.y)) {
						shape.color = 'green';
						break;
					}
				}
				this.valid = false;
			}, true);
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

		addShape(shape) {
			this.shapes.push(shape);
			this.valid = false;			
		}

		getSimpleMousePos(e) {
			return { 
				x: e.pageX - this.canvas.offsetLeft,
				y: e.pageY - this.canvas.offsetTop
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

		clearSelection() {
			if (this.selection) {
				if (this.selection instanceof Shape) {
					this.selection.deselect();
				} else {
					this.selection.forEach(shape => shape.deselect());
				}
			}
			this.selection = null;
		}

		selectShapes(selection) {
			this.selection = selection;
			if (selection instanceof Shape) {
				this.selection.select();
			} else {
				this.selection.forEach(shape => shape.select());
			} 
		}
	}

	function handleGraphJSON(json){
		const nodes = json['nodes'];
		const edges = json['edges'];

		const controls = document.getElementById('controls');

		let downloadLink = document.getElementById('sbml-download');
		if (!downloadLink) {
			downloadLink = document.createElement('a');
			downloadLink.setAttribute('download', 'sbml.xml');
			downloadLink.setAttribute('id', 'sbml-download');
			downloadLink.innerHTML = 'Download Model SBML'
			controls.appendChild(downloadLink);
		}
		downloadLink.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(json['sbml']));

		let redrawButton = document.getElementById('redraw-form');
		redrawButton.style.display = 'inline';

		myCanvas.clear();
		edges.forEach(edge => myCanvas.addShape(new HyperEdge(edge)));
		nodes.forEach(node => myCanvas.addShape(new Node(node)));
	}

	function handleFileSubmision(e) {
		e.preventDefault();

		const uploadButton = document.getElementById('upload-button');
		const fileSelect = document.getElementById('file-select');
		uploadButton.innerHTML = 'Uploading...';

		const formData = new FormData();
		formData.append('sbml', fileSelect.files[0], 'sbml.xml');
		formData.append('height', myCanvas.height);
		formData.append('width', myCanvas.width);

		const init = {
			method: "POST",
			body: formData,
		};

		fetch("upload", init)
			.then(checkStatus)
			.then(JSON.parse)
			.then(handleGraphJSON)
			.catch(console.log);

		uploadButton.innerHTML = 'Upload';
	}

	function handleRedraw(e) {
		e.preventDefault();

		const formData = new FormData();
		formData.append('height', myCanvas.height);
		formData.append('width', myCanvas.width);

		const init = {
			method: "POST",
			body: formData,
		};

		fetch("redraw", init)
			.then(checkStatus)
			.then(JSON.parse)
			.then(handleGraphJSON)
			.catch(console.log);
	}

	function main() {
		myCanvas = new Canvas(document.getElementById('canvas'));
		myCanvas.width = window.innerWidth / 2;
		myCanvas.height = window.innerHeight;

		const fileForm = document.getElementById('file-form');
		const redrawForm = document.getElementById('redraw-form');
		fileForm.addEventListener("submit", handleFileSubmision);
		redrawForm.addEventListener("submit", handleRedraw);
	}
})();