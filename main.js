(function($){
  // var trace = function(msg){
  //   if (typeof(window)=='undefined' || !window.console) return
  //   var len = arguments.length, args = [];
  //   for (var i=0; i<len; i++) args.push("arguments["+i+"]")
  //   eval("console.log("+args.join(",")+")")
  // }  
  
  var Renderer = function(elt){
    var dom = $(elt)
    var canvas = dom.get(0)
    var ctx = canvas.getContext("2d");
    var gfx = arbor.Graphics(canvas)
    var sys = null

    var _vignette = null
    var selected = null,
        nearest = null,
        _mouseP = null;

    
    var that = {
      init:function(pSystem){
        sys = pSystem
        sys.screen({size:{width:dom.width(), height:dom.height()},
                    padding:[36,60,36,60]})

        $(window).resize(that.resize)
        that.resize()
        that._initMouseHandling()
      },
      resize:function(){
        canvas.width = $(window).width()
        canvas.height = .75* $(window).height()
        sys.screen({size:{width:canvas.width, height:canvas.height}})
				//Uncaught TypeError: Cannot call method 'screen' of null
        _vignette = null
        that.redraw()
      },
      redraw:function(){
        gfx.clear()
        sys.eachEdge(function(edge, p1, p2){
          if (edge.source.data.alpha * edge.target.data.alpha == 0) return
          gfx.line(p1, p2, {stroke:"#b2b19d", width:2, alpha:edge.target.data.alpha})
        })
        sys.eachNode(function(node, pt){
          var w = Math.max(20, 20+gfx.textWidth(node.name) )
          if (node.data.alpha===0) return
          if (node.data.shape=='dot'){
            gfx.oval(pt.x-w/2, pt.y-w/2, w, w, {fill:node.data.color, alpha:node.data.alpha})
            gfx.text(node.name, pt.x, pt.y+7, {color:"white", align:"center", font:"Arial", size:12})
            gfx.text(node.name, pt.x, pt.y+7, {color:"white", align:"center", font:"Arial", size:12})
          }else{
            gfx.rect(pt.x-w/2, pt.y-8, w, 20, 4, {fill:node.data.color, alpha:node.data.alpha})
            gfx.text(node.name, pt.x, pt.y+9, {color:"white", align:"center", font:"Arial", size:12})
            gfx.text(node.name, pt.x, pt.y+9, {color:"white", align:"center", font:"Arial", size:12})
          }
        })
        that._drawVignette()
      },
      
      _drawVignette:function(){
        var w = canvas.width
        var h = canvas.height
        var r = 20

        if (!_vignette){
          var top = ctx.createLinearGradient(0,0,0,r)
          top.addColorStop(0, "#e0e0e0")
          top.addColorStop(.7, "rgba(255,255,255,0)")

          var bot = ctx.createLinearGradient(0,h-r,0,h)
          bot.addColorStop(0, "rgba(255,255,255,0)")
          bot.addColorStop(1, "white")

          _vignette = {top:top, bot:bot}
        }
        
        // top
        ctx.fillStyle = _vignette.top
        ctx.fillRect(0,0, w,r)

        // bot
        ctx.fillStyle = _vignette.bot
        ctx.fillRect(0,h-r, w,r)
      },

      switchMode:function(e){
        if (e.mode=='hidden'){
          dom.stop(true).fadeTo(e.dt,0, function(){
            if (sys) sys.stop()
            $(this).hide()
          })
        }else if (e.mode=='visible'){
          dom.stop(true).css('opacity',0).show().fadeTo(e.dt,1,function(){
            that.resize()
          })
          if (sys) sys.start()
        }
      },
      
      switchSection:function(newSection){
        var parent = sys.getEdgesFrom(newSection)[0].source
        var children = $.map(sys.getEdgesFrom(newSection), function(edge){
          return edge.target
        })
        
        sys.eachNode(function(node){
          if (node.data.shape=='dot') return // skip all but leafnodes

          var nowVisible = ($.inArray(node, children)>=0)
          var newAlpha = (nowVisible) ? 1 : 0
          var dt = (nowVisible) ? .5 : .5
          sys.tweenNode(node, dt, {alpha:newAlpha})

          if (newAlpha==1){
            node.p.x = parent.p.x + .05*Math.random() - .025
            node.p.y = parent.p.y + .05*Math.random() - .025
            node.tempMass = .001
          }
        })
      },
      
      
      _initMouseHandling:function(){
        // no-nonsense drag and drop (thanks springy.js)
        selected = null;
        nearest = null;
        var dragged = null;
        var oldmass = 1

        var _section = null

        var handler = {
          moved:function(e){
            var pos = $(canvas).offset();
            _mouseP = arbor.Point(e.pageX-pos.left, e.pageY-pos.top)
            nearest = sys.nearest(_mouseP);

            if (!nearest.node) return false

            if (nearest.node.data.shape!='dot'){
              selected = (nearest.distance < 50) ? nearest : null
              if (selected){
                 dom.addClass('linkable')
                 window.status = selected.node.data.link.replace(/^\//,"http://"+window.location.host+"/").replace(/^#/,'')
              }
              else{
                 dom.removeClass('linkable')
                 window.status = ''
              }
            }else if ($.inArray(nearest.node.name, ['arbor.js','code','docs','demos']) >=0 ){
              if (nearest.node.name!=_section){
                _section = nearest.node.name
                that.switchSection(_section)
              }
              dom.removeClass('linkable')
              window.status = ''
            }
            
            return false
          },
          clicked:function(e){
            var pos = $(canvas).offset();
            _mouseP = arbor.Point(e.pageX-pos.left, e.pageY-pos.top)
            nearest = dragged = sys.nearest(_mouseP);
            
            if (nearest && selected && nearest.node===selected.node){
              var link = selected.node.data.link
              if (link.match(/^#/)){
                 $(that).trigger({type:"navigate", path:link.substr(1)})
              }else{
                 window.location = link
              }
              return false
            }
            
            
            if (dragged && dragged.node !== null) dragged.node.fixed = true

            $(canvas).unbind('mousemove', handler.moved);
            $(canvas).bind('mousemove', handler.dragged)
            $(window).bind('mouseup', handler.dropped)

            return false
          },
          dragged:function(e){
            var old_nearest = nearest && nearest.node._id
            var pos = $(canvas).offset();
            var s = arbor.Point(e.pageX-pos.left, e.pageY-pos.top)

            if (!nearest) return
            if (dragged !== null && dragged.node !== null){
              var p = sys.fromScreen(s)
              dragged.node.p = p
            }

            return false
          },

          dropped:function(e){
            if (dragged===null || dragged.node===undefined) return
            if (dragged.node !== null) dragged.node.fixed = false
            dragged.node.tempMass = 1000
            dragged = null;
            // selected = null
            $(canvas).unbind('mousemove', handler.dragged)
            $(window).unbind('mouseup', handler.dropped)
            $(canvas).bind('mousemove', handler.moved);
            _mouseP = null
            return false
          }


        }

        $(canvas).mousedown(handler.clicked);
        $(canvas).mousemove(handler.moved);

      }
    }
    
    return that
  }
    
  $(document).ready(function(){
	
		var sys = arbor.ParticleSystem(1000, 400,1);
	  sys.parameters({gravity:true});
	  sys.renderer = Renderer("#viewport") ;
		
		//nodes 
	  var blog = sys.addNode('Blog',{  color:'red',
																		 shape:'dot',
																		 label:'blog', 
																		 link : 'http://natashatherobot.com/'
																	 });
	  var projects = sys.addNode('Projects',{  color:'blue',
																						 shape:'dot',
																						 label:'projects', 
																						 link : 'https://github.com/natashatherobot'
																					 });
	  var contact = sys.addNode('Contact',{  color:'orange',
																						 shape:'dot',
																						 label:'contact', 
																						 link : 'mailto:nmurashev@gmail.com'
																					 });
	  var connect = sys.addNode('Connect',{  color:'green',
																						 shape:'dot',
																						 label:'follow me', 
																					 });
	  var facebook = sys.addNode('F',{  color:'blue',
																						 shape:'dot',
																						 label:'facebook', 
																						 link : 'http://www.facebook.com/natasha.murashev'
																					 });
	  var twitter = sys.addNode('t',{  color:'blue',
																		 shape:'dot',
																		 label:'twitter', 
																		 link : 'https://twitter.com/natashatherobot'
																	 });
	  var linkedin = sys.addNode('in',{  color:'blue',
																		 shape:'dot',
																		 label:'linkedin', 
																		 link : 'http://www.linkedin.com/in/natashamurashev'
																	 });
	  var github = sys.addNode('in',{  color:'blue',
																		 shape:'dot',
																		 label:'github', 
																		 link : 'https://github.com/natashatherobot'
																	 });
	  var me = sys.addNode('me',{  color:'pink',
																 shape:'dot',
																 label:'me', 
															 });

		//connecting the nodes
		sys.addEdge(me, blog);
		sys.addEdge(me, connect);
		sys.addEdge(me, projects);
		sys.addEdge(me, contact);
		sys.addEdge(connect, facebook);
		sys.addEdge(connect, twitter);
		sys.addEdge(connect, linkedin);
		sys.addEdge(connect, github)														
		
																					
																					
    // var CLR = {
    //   branch:"#b2b19d",
    //   code:"orange",
    //   doc:"#922E00",
    //   demo:"#a7af00"
    // }
    // 
    // var theUI = {
    //   nodes:{"arbor.js":{color:"red", shape:"dot", alpha:1}, 
    //   
    //          demos:{color:CLR.branch, shape:"dot", alpha:1}, 
    //          halfviz:{color:CLR.demo, alpha:0, link:'/halfviz'},
    //          atlas:{color:CLR.demo, alpha:0, link:'/atlas'},
    //          echolalia:{color:CLR.demo, alpha:0, link:'/echolalia'},
    // 
    //          docs:{color:CLR.branch, shape:"dot", alpha:1}, 
    //          reference:{color:CLR.doc, alpha:0, link:'#reference'},
    //          introduction:{color:CLR.doc, alpha:0, link:'#introduction'},
    // 
    //          code:{color:CLR.branch, shape:"dot", alpha:1},
    //          github:{color:CLR.code, alpha:0, link:'https://github.com/samizdatco/arbor'},
    //          ".zip":{color:CLR.code, alpha:0, link:'/js/dist/arbor-v0.92.zip'},
    //          ".tar.gz":{color:CLR.code, alpha:0, link:'/js/dist/arbor-v0.92.tar.gz'}
    //         },
    //   edges:{
    //     "arbor.js":{
    //       demos:{length:.8},
    //       docs:{length:.8},
    //       code:{length:.8}
    //     },
    //     demos:{halfviz:{},
    //            atlas:{},
    //            echolalia:{}
    //     },
    //     docs:{reference:{},
    //           introduction:{}
    //     },
    //     code:{".zip":{},
    //           ".tar.gz":{},
    //           "github":{}
    //     }
    //   }
    // }
    // 
    // 
    // var sys = arbor.ParticleSystem()
    // sys.parameters({stiffness:900, repulsion:2000, gravity:true, dt:0.015})
    // sys.renderer = Renderer("#sitemap")
    // sys.graft(theUI)
  })
})(this.jQuery)










// //
// //  main.js
// //
// //  A project template for using arbor.js
// //
// 
// (function($){
// 
//   var Renderer = function(canvas){
//     var canvas = $(canvas).get(0)
//     var ctx = canvas.getContext("2d");
//     var particleSystem
// 
//     var that = {
//       init:function(system){
//         //
//         // the particle system will call the init function once, right before the
//         // first frame is to be drawn. it's a good place to set up the canvas and
//         // to pass the canvas size to the particle system
//         //
//         // save a reference to the particle system for use in the .redraw() loop
//         particleSystem = system
// 
//         // inform the system of the screen dimensions so it can map coords for us.
//         // if the canvas is ever resized, screenSize should be called again with
//         // the new dimensions
//         particleSystem.screenSize(canvas.width, canvas.height) 
//         particleSystem.screenPadding(80) // leave an extra 80px of whitespace per side
//         
//         // set up some event handlers to allow for node-dragging
//         that.initMouseHandling()
//       },
//       
//       redraw:function(){
//         // 
//         // redraw will be called repeatedly during the run whenever the node positions
//         // change. the new positions for the nodes can be accessed by looking at the
//         // .p attribute of a given node. however the p.x & p.y values are in the coordinates
//         // of the particle system rather than the screen. you can either map them to
//         // the screen yourself, or use the convenience iterators .eachNode (and .eachEdge)
//         // which allow you to step through the actual node objects but also pass an
//         // x,y point in the screen's coordinate system
//         // 
//         ctx.fillStyle = "#f9f9f9"
//         ctx.fillRect(0,0, canvas.width, canvas.height)
//         
//         particleSystem.eachEdge(function(edge, pt1, pt2){
// 
//           // draw a line from pt1 to pt2
//           ctx.strokeStyle = "rgba(0,0,0, .333)"
//           ctx.lineWidth = 1
//           ctx.beginPath()
//           ctx.moveTo(pt1.x, pt1.y)
//           ctx.lineTo(pt2.x, pt2.y)
//           ctx.stroke()
//         })
// 
//         particleSystem.eachNode(function(node, pt){
// 					
// 					if(node.name === 'center') {
// 						var radius = 60;
// 						
// 						var image = new Image();
// 						image.src = 'meround.png'
// 						ctx.drawImage(image, pt.x - radius, pt.y - radius, radius * 2, radius * 2);
// 						
// 						ctx.beginPath();
// 						ctx.arc(pt.x - radius, pt.y - radius, 0, Math.PI * 2, true);
// 
// 					} 
// 					
// 					else if(node.name === 'blog') {
// 						
// 						//circle
// 						var radius = 40;
// 						ctx.fillStyle = "white";
// 						ctx.beginPath();
// 						ctx.arc(pt.x, pt.y, radius, 0, 2 * Math.PI, false);
// 						ctx.fill();
// 						ctx.closePath();
// 						
// 						//text
// 						ctx.fillStyle = "rgba(0,0,0, .333)";
// 						ctx.font = "22px verdana";
// 						//ctx.strokeStyle = "rgba(0,0,0, .333)"
// 						ctx.fillText("Blog", pt.x - radius / 2, pt.y + radius/4);
// 						ctx.measureText('http://natashatherobot.com').width
// 						ctx.fill();
// 					} 	
// 					
// 					else if(node.name === 'projects') {
// 							//console.log(node)
// 							var newradius = 10;
// 							ctx.fillStyle = "green";
// 							ctx.beginPath();
// 							ctx.arc(pt.x, pt.y, newradius, 0, 2 * Math.PI, false);
// 							ctx.fill();
// 					} 
// 						
// 					else if(node.name === 'social') {
// 							//console.log(node)
// 							var newradius = 10;
// 							ctx.fillStyle = "green";
// 							ctx.beginPath();
// 							ctx.arc(pt.x, pt.y, newradius, 0, 2 * Math.PI, false);
// 							ctx.fill();
// 		    	} 
// 		  
// 					else if(node.name === 'contact') {
// 							var newradius = 10;
// 							ctx.fillStyle = "green";
// 							ctx.beginPath();
// 							ctx.arc(pt.x, pt.y, newradius, 0, 2 * Math.PI, false);
// 							ctx.fill();				
// 					}			
// 					
//         })    			
//       },
//       
//       initMouseHandling:function(){
//         // no-nonsense drag and drop (thanks springy.js)
//         var dragged = null;
// 
//         // set up a handler object that will initially listen for mousedowns then
//         // for moves and mouseups while dragging
//         var handler = {
//           clicked:function(e){
//             var pos = $(canvas).offset();
//             _mouseP = arbor.Point(e.pageX-pos.left, e.pageY-pos.top)
//             dragged = particleSystem.nearest(_mouseP);
// 
//             if (dragged && dragged.node !== null){
//               // while we're dragging, don't let physics move the node
//               dragged.node.fixed = true
//             }
// 
//             $(canvas).bind('mousemove', handler.dragged)
//             $(window).bind('mouseup', handler.dropped)
// 
//             return false
//           },
//           dragged:function(e){
//             var pos = $(canvas).offset();
//             var s = arbor.Point(e.pageX-pos.left, e.pageY-pos.top)
// 
//             if (dragged && dragged.node !== null){
//               var p = particleSystem.fromScreen(s)
//               dragged.node.p = p
//             }
// 
//             return false
//           },
// 
//           dropped:function(e){
//             if (dragged===null || dragged.node===undefined) return
//             if (dragged.node !== null) dragged.node.fixed = false
//             dragged.node.tempMass = 1000
//             dragged = null
//             $(canvas).unbind('mousemove', handler.dragged)
//             $(window).unbind('mouseup', handler.dropped)
//             _mouseP = null
//             return false
//           }
//         }
//         
//         // start listening
//         $(canvas).mousedown(handler.clicked);
// 
//       },
//       
//     }
//     return that
//   }    
// 
//   $(document).ready(function(){
//     var sys = arbor.ParticleSystem(1000, 600, 0.5) // create the system with sensible repulsion/stiffness/friction
//     sys.parameters({gravity:true}) // use center-gravity to make the graph settle nicely (ymmv)
//     sys.renderer = Renderer("#viewport") // our newly created renderer will have its .init() method called shortly by sys...
// 
//     // add some nodes to the graph and watch it go...
//     sys.addEdge('center', 'blog', {'label' : 'Blog'})
//     sys.addEdge('center','projects')
//     sys.addEdge('center','contact')
//     sys.addEdge('center','social')
// 		sys.addEdge('social', 'twitter')
// 		sys.addEdge('social', 'linkedin')
// 		sys.addEdge('social', 'facebook')
//   })
// 
// })(this.jQuery)