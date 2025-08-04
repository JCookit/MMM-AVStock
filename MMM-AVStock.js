Module.register("MMM-AVStock", {
    defaults: {
        apiKey : "",
        timeFormat: "DD-MM HH:mm",
        symbols : ["AAPL", "GOOGL", "TSLA"],
        alias: [],
        width: null,
        height: 400,
        direction: 'row',
        classes: 'xsmall',
        callInterval: 1000*2*60,
        mode : "table",                  // "table", "ticker", "grid", "series"
        tickerDuration: 20,
        chartDays: 30,
        tableHeaders: ["symbol", "price", "close", "change", "changeP", "pPrice", "perf2P", "volume"],
        tableHeaderTitles: {
            symbol: "Symbol", 
            price: "Price", 
            close: "Close", 
            change: "CHG", 
            changeP: "CHG%", 
            pPrice: "Purch", 
            perf2P: "Profit", 
            volume: "Vol"
        },
        maxTableRows: null,
        showChart: true,
        chartWidth: null,
        width: null,
        showVolume: true,
        chartInterval: "daily",          // choose from ["intraday", "daily", "weekly", "monthly"]
        intraDayInterval: "5min",        // choose from ["1min", "5min", "15min", "30min", "60min"]
        movingAverage: {
            type: "SMA",
            periods: [200]
        },
        decimals : 2,
        activeHours: [8, 22],
        chartType: 'line',
        chartUpdateInterval: 5*1000,
        alternateGridColor: '#223344',
        pureLine: false,
        chartNavigator: false,
        chartLineColor: '#eee',
        chartLabelColor: '#eee',
        coloredCandles: true,
        purchasePrice: [0,0,0],
        showPurchasePrices: false,
        showPerformance2Purchase: false,
        debug: false,
        // Chart.js configuration options (similar to MMM-WeatherChart)
        chartjsVersion: "3.9.1",
        chartjsFinancialVersion: "0.2.1",
        chartjsAdapterMomentVersion: "1.0.1",
        volumeChartPercent: 25, // Percentage of chart height for volume (bottom)
    },

    getScripts: function() {
        // Load chart.js from CDN (exactly like MMM-WeatherChart)
        let chartjsFileName = "chart.min.js";
        if (Number(this.config.chartjsVersion.split(".")[0]) < 3) {
            chartjsFileName = "Chart.min.js";
        }
        return [
            "https://cdn.jsdelivr.net/npm/chart.js@" +
                this.config.chartjsVersion +
                "/dist/" +
                chartjsFileName,
            "https://cdn.jsdelivr.net/npm/chartjs-adapter-moment@" +
                this.config.chartjsAdapterMomentVersion +
                "/dist/chartjs-adapter-moment.min.js",
            "https://cdn.jsdelivr.net/npm/chartjs-chart-financial@" +
                this.config.chartjsFinancialVersion +
                "/dist/chartjs-chart-financial.min.js"
        ];
    },

    getStyles: function() {
        return [
            "MMM-AVStock.css",
        ];
    },

    start: function() {
        this.sendSocketNotification("INIT", this.config);
        this.stocks = {};
        this.chart = null; // Initialize Chart.js instance tracker
        this.chartChanger = null; // Chart rotation interval
        this.chartCount = 0; // Current chart index
        this.isVisible = true; // Track module visibility
        for (var i = 0; i < this.config.symbols.length; i++) {
            this.stocks[this.config.symbols[i]] = {
                quotes: {},
                hist: {}
            };
        };
        this.log(this.stocks);
        this.config.locale = config.language;
        this.loaded = false;
        if (!this.config.showPurchasePrices) this.config.tableHeaders.splice(this.config.tableHeaders.indexOf("pPrice"), 1);
        if (!this.config.showPerformance2Purchase) this.config.tableHeaders.splice(this.config.tableHeaders.indexOf("perf2P"), 1);
        this.log(this.config.tableHeaders);
    },

    notificationReceived: function(noti, payload) {
        if (noti == "DOM_OBJECTS_CREATED") {
            this.log(this.name + " initializing...")
            
            // Register Chart.js financial charts if available
            if (typeof Chart !== 'undefined' && Chart.register) {
                // Note: Financial chart registration should happen automatically with chartjs-chart-financial
                // If manual registration is needed, it would be done here
                this.log("Chart.js loaded successfully");
            }
            
            this.sendSocketNotification("GET_STOCKDATA", this.config);
            var self = this;
            setInterval(() => {
                self.log("Requesting stock Data");
                self.sendSocketNotification("GET_STOCKDATA", self.config);
                self.log(this.name + " requesting stock data...")
            }, this.config.callInterval);
        }
    },

    // MagicMirror's built-in suspend/resume methods for when module is not displayed
    suspend: function() {
        this.log(this.name + " is suspended");
        this.pauseChartChanger();
    },

    resume: function() {
        this.log(this.name + " is resumed");
        if (this.isVisible) {
            this.resumeChartChanger();
        }
    },

    // MagicMirror's built-in show/hide methods for MMM-pages integration
    show: function(speed, callback) {
        this.log(this.name + " is being shown");
        this.isVisible = true;
        
        // Call the parent show method
        if (Module.prototype.show) {
            Module.prototype.show.call(this, speed, callback);
        }
        
        // Update the current chart if data is loaded
        if (this.loaded && this.config.showChart && this.config.symbols.length > 0) {
            this.updateChart(this.config.symbols[this.chartCount]);
        }
        this.resumeChartChanger();
    },

    hide: function(speed, callback) {
        this.log(this.name + " is being hidden");
        this.isVisible = false;
        this.pauseChartChanger();
        
        // Call the parent hide method
        if (Module.prototype.hide) {
            Module.prototype.hide.call(this, speed, callback);
        }
    },


    getStockName: function(symbol) {
        var stockAlias = symbol;
        var i = this.config.symbols.indexOf(symbol);
        stockAlias = (this.config.alias[i]) ? this.config.alias[i] : stockAlias;
        return stockAlias;
    },

    pauseChartChanger: function() {
        if (this.chartChanger) {
            this.log("Pausing chart changer");
            clearInterval(this.chartChanger);
            this.chartChanger = null;
            // try this out:  increment the chart index when it is hidden, so the next time it is shown, it will show the next chart
            this.chartCount = (this.chartCount === this.config.symbols.length - 1) ? 0 : this.chartCount + 1;
            this.log("Count: " + this.chartCount);
        }
    },

    resumeChartChanger: function() {
        // Only resume if module is loaded, visible, charts are enabled, and chartChanger is not already running
        if (this.loaded && this.isVisible && this.config.showChart && !this.chartChanger && this.config.symbols.length > 1) {
            this.log("Resuming chart changer");
            var self = this;
            this.chartChanger = setInterval(function() {
                self.chartCount = (self.chartCount === self.config.symbols.length - 1) ? 0 : self.chartCount + 1;
                self.log("Count: " + self.chartCount);
                self.updateChart(self.config.symbols[self.chartCount]);
            }, self.config.chartUpdateInterval);
        }
    },

    startChartChanger: function() {
        // Only start chart changer if charts are enabled, there's more than one symbol, and module is visible
        if (this.config.showChart && this.config.symbols.length > 1) {
            this.chartCount = 0;
            this.updateChart(this.config.symbols[this.chartCount]);
            // Only start the interval if module is visible
            if (this.isVisible) {
                this.resumeChartChanger();
            }
        } else if (this.config.showChart && this.config.symbols.length === 1) {
            // If only one symbol, just show its chart without rotation
            this.chartCount = 0;
            this.updateChart(this.config.symbols[this.chartCount]);
        }
    },


    switchTable: function(page) {
        var tbl = document.getElementById("AVSTOCK_TABLE");
        tbl.innerHTML = "";

        var thead = document.createElement("thead");
        var tr = document.createElement("tr");
        for (var i in this.config.tableHeaders) {
            var td = document.createElement("td");
            td.innerHTML = this.config.tableHeaderTitles[i];
            td.className = this.config.tableHeaders[i];
            tr.appendChild(td);
        }
        thead.appendChild(tr);
        tbl.appendChild(thead);

        var pages = Math.ceil(this.config.symbols.length / this.config.maxTableRows);
        var rowCount = Math.min(this.config.maxTableRows, this.config.symbols.length);
        var rows = ((pages > 1) && (page == pages-1)) ? (this.config.symbols.length % (page*rowCount)) : rowCount;
        this.log(rowCount + " rowCount, " + pages + " Pages, Page 0, " + rows + " rows");

        var self = this;

        for (let i = page*rowCount; i < (page*rowCount + rows) ; i++) {
            var symbol = this.config.symbols[i];
            var hashId = symbol.hashCode();
            var tr = document.createElement("tr");
            tr.className = "stock_tr";
            if (i % 2 != 0) tr.style.backgroundColor = '#333'
            tr.id = "STOCK_" + hashId;
            for (let j = 0 ; j < this.config.tableHeaders.length; j++) {
                var td = document.createElement("td");
                var stockAlias = this.getStockName(symbol);
                td.innerHTML = (j != 0) ? (this.stocks[symbol].quote) ? this.stocks[symbol]["quote"][this.config.tableHeaders[j]] : "---" : stockAlias;
                td.className = this.config.tableHeaders[j];
                td.id = this.config.tableHeaders[j] + "_" + hashId;
                tr.appendChild(td);
            }
            if (this.config.showChart) {
                tr.addEventListener("click", function () {
                    self.log("Clicked on " + self.config.symbols[i]);
                    self.updateChart(self.stocks[self.config.symbols[i]]);
                });
            }
            tbl.appendChild(tr);
        }
        if (pages > 1) {
            for (let k = 0; k < pages; k++) {
                var circle = document.getElementById("avstock-ind-" + k);
                if (k == page) {
                    circle.classList.add("bright","active-nav")
                } else {
                    circle.classList.remove("bright","active-nav")
                }
            }
        }

    },


    getDom: function() {
        var mode = this.config.mode;
        var wrapper = document.createElement("div");
        wrapper.id = "AVSTOCK";
        wrapper.style.width = this.config.width;
        wrapper.style.flexDirection = this.config.direction;
        wrapper.className = this.config.classes;
        
        var elWrapper = document.createElement("div");
        elWrapper.className = mode + "-wrapper "
        elWrapper.style.width = (this.config.width == null) ? '100%' : this.config.width + 'px';

        if (mode == "table") {
            var headerRow = document.createElement("div");
            headerRow.className = "table-header";
            for (var i = 0; i < this.config.tableHeaders.length; i++) {
                var headerDiv = document.createElement("div");
                headerDiv.className = "table-header-item";
                headerDiv.innerHTML = this.config.tableHeaderTitles[this.config.tableHeaders[i]];
                headerRow.appendChild(headerDiv);
            }
            elWrapper.appendChild(headerRow);
        }
       
        var self = this;
        for (let i = 0; i < this.config.symbols.length; i++) {
            this.log("Adding item...");
            var stock = this.config.symbols[i];
            var pPrice = this.config.purchasePrice[i] || 0;
            var item = document.createElement("div");
            item.className = "stock_item stock " + this.getStockData(stock, "up") + " " + this.getStockData(stock, "profit");
            item.id = mode + "_stock_" + stock;

            var symbol = document.createElement("div");
            symbol.className = "symbol item_sect";
            symbol.innerHTML = this.getStockName(stock);
            symbol.id = mode + "_symbol_" + stock;

            var price = document.createElement("div");
            price.className = "price";
            price.innerHTML = this.getStockData(stock, "price");
            price.id = mode + "_price_" + stock;
            
            var prevClose = document.createElement("div");
            prevClose.className = "close";
            prevClose.innerHTML = this.getStockData(stock, "prevClose");
            prevClose.id = mode + "_close_" + stock;

            var anchor1 = document.createElement("div");
            anchor1.className = "anchor item_sect";

            var changeP = document.createElement("div");
            changeP.className = "changeP";
            changeP.innerHTML = this.getStockData(stock, "changeP");
            changeP.id = mode + "_changeP_" + stock;

            var change = document.createElement("div");
            change.className = "change";
            change.innerHTML = this.getStockData(stock, "change");
            change.id = mode + "_change_" + stock;

            var vol = document.createElement("div");
            vol.className = "volume xsmall";
            vol.innerHTML = this.getStockData(stock, "volume");
            vol.id = mode + "_volume_" + stock;

            var anchor2 = document.createElement("div");
            anchor2.className = "anchor item_sect";

            var purchase = document.createElement("div");
            purchase.className = "anchor item_sect";

            var purchasePrice = document.createElement("div");
            purchasePrice.className = "purchasePrice";
            purchasePrice.innerHTML = pPrice; //this.getStockData(stock, "pPrice");
            purchasePrice.id = mode + "_purchasePrice_" + stock;

            var purchaseChange = document.createElement("div");
            purchaseChange.className = "purchaseChange";
            purchaseChange.innerHTML = this.getStockData(stock, "perf2P");
            purchaseChange.id = mode + "_purchaseChange_" + stock;
            
            switch (mode) {
                case "grid":
                    item.appendChild(symbol);
                    anchor1.appendChild(price);
                    anchor1.appendChild(vol);
                    item.appendChild(anchor1);
                    anchor2.appendChild(change);
                    anchor2.appendChild(changeP);
                    item.appendChild(anchor2);            
                    if (this.config.showPurchasePrices) {
                        purchase.appendChild(purchaseChange);
                        purchase.appendChild(purchasePrice);
                        item.appendChild(purchase);
                    };
                    break;
                case "table":
                    if (i % 2 != 0) item.style.backgroundColor = '#333';
                    item.appendChild(symbol);
                    item.appendChild(price);
                    item.appendChild(prevClose);
                    item.appendChild(change);
                    item.appendChild(changeP);
                    if (this.config.showPurchasePrices) {
                        item.appendChild(purchasePrice);
                        item.appendChild(purchaseChange);
                    };
                    item.appendChild(vol);
                    break;
                case "ticker":
                    anchor1.appendChild(symbol);
                    anchor1.appendChild(price);
                    item.appendChild(anchor1);
                    anchor2.appendChild(change);
                    anchor2.appendChild(changeP);
                    item.appendChild(anchor2);            
                    if (this.config.showPurchasePrices) {
                        purchase.appendChild(purchaseChange);
                        purchase.appendChild(purchasePrice);
                        item.appendChild(purchase);
                    }
                    break;
                default: 
            };
            
            if (this.config.showChart) {
                item.addEventListener("click", function() {
                    self.log("Clicked on " + self.config.symbols[i]);
                    // Pause automatic chart changing when user manually selects a chart
                    self.pauseChartChanger();
                    // Update the chart count to match the clicked symbol
                    self.chartCount = i;
                    self.updateChart(self.config.symbols[i]);
                    // Resume automatic chart changing after a delay
                    setTimeout(function() {
                        if (self.isVisible) {
                            self.resumeChartChanger();
                        }
                    }, self.config.chartUpdateInterval * 2); // Wait 2 cycles before resuming
                });
            };
            elWrapper.appendChild(item);
        };
        
        if (this.config.mode === "ticker") {
            var tickerWindow = document.createElement("div");
            tickerWindow.id = "ticker-window";
            tickerWindow.appendChild(elWrapper);
            elWrapper.style.animationDuration = this.config.tickerDuration + 's';
            //elWrapper.style.width = (this.config.symbols.length * 160) + 'px';
            wrapper.appendChild(tickerWindow)
        } else {
            wrapper.appendChild(elWrapper);
        }
        
        wrapper.appendChild(this.addTagLine());
        
        if (this.config.showChart) {
            var chartWrapper = document.createElement("div");
            chartWrapper.style.width = (this.config.width == null) ? '100%' : this.config.width + 'px';
            chartWrapper.style.height = this.config.height + 'px';

            var stockChart = document.createElement("div");
            stockChart.id = "AVSTOCK_CHART";
            stockChart.style.height = this.config.height + 'px';

            var head = document.createElement("div");
            head.className = "head anchor";
            head.id = "stockchart_head";

            var symbol = document.createElement("div");
            symbol.className = "symbol item_sect";
            symbol.innerHTML = "---";
            symbol.style.marginRight = "10px";
            symbol.id = "stockchart_symbol";

            var price = document.createElement("div");
            price.className = "price";
            price.innerHTML = "---";
            price.id = "stockchart_price";

            var changeP = document.createElement("div");
            changeP.className = "changeP";
            changeP.innerHTML = "---";
            changeP.id = "stockchart_changeP";

            head.appendChild(symbol);
            head.appendChild(price);
            head.appendChild(changeP);

            chartWrapper.appendChild(head);
            chartWrapper.appendChild(stockChart);
            wrapper.appendChild(chartWrapper);
        }
        return wrapper;
    },
    
    
    addTagLine: function () {
        var tl = document.createElement("div");
        tl.className = "tagline";
        tl.style.width = (this.config.width == null) ? '100%' : this.config.width + 'px';
        tl.id = "AVSTOCK_TAGLINE";
        tl.innerHTML = "Last quote: " + (moment(this.updateTime, "x").format(this.config.timeFormat) || "---")
        return tl;
    },


    updateData: function(mode) {
        for (let i = 0; i< this.config.symbols.length; i++) {
            var stock = this.config.symbols[i];
            var item = document.getElementById(mode + "_stock_" + stock);
            item.className = "stock_item stock " + this.getStockData(stock, "up") + " " + this.getStockData(stock, "profit"); ; 
            
            var symbol = document.getElementById(mode + "_symbol_" + stock);
            symbol.innerHTML = this.getStockName(stock);

            var price = document.getElementById(mode + "_price_" + stock);
            price.innerHTML = this.getStockData(stock, "price");
            
            var changeP = document.getElementById(mode + "_changeP_" + stock);
            changeP.innerHTML = this.getStockData(stock, "changeP");
            
            var change = document.getElementById(mode + "_change_" + stock);
            change.innerHTML = this.getStockData(stock, "change");
            
            if (mode == "table") {
                var prevClose = document.getElementById(mode + "_close_" + stock);
                prevClose.innerHTML = this.getStockData(stock, "prevClose");
            };
            
            if (mode != "ticker") {
                var vol = document.getElementById(mode + "_volume_" + stock);
                vol.innerHTML = this.getStockData(stock, "volume");
                
            } /*else {                
                var item2 = document.getElementById(mode + "_stock_" + stock + "_2");
                item2.className = "stock_item stock " + this.getStockData(stock, "up") + " " + this.getStockData(stock, "profit"); ; 
                
                var symbol2 = document.getElementById(mode + "_symbol_" + stock + "_2");
                symbol2.innerHTML = this.getStockName(stock);

                var price2 = document.getElementById(mode + "_price_" + stock + "_2");
                price2.innerHTML = this.getStockData(stock, "price");
                
                var changeP2 = document.getElementById(mode + "_changeP_" + stock + "_2");
                changeP2.innerHTML = this.getStockData(stock, "changeP");
                
                var change2 = document.getElementById(mode + "_change_" + stock + "_2");
                change2.innerHTML = this.getStockData(stock, "change");
            };*/
            
            if (this.config.showPerformance2Purchase) {
                var perf2P = document.getElementById(mode + "_purchaseChange_" + stock);
                perf2P.innerHTML = this.getStockData(stock, "perf2P");
            }
        }
    },
    
    
    getStockData: function (stock, value) {
        if (this.stocks.hasOwnProperty(stock)) {
            return (this.stocks[stock]["quotes"][value] || "---")
        }
        return "---"
    },


    socketNotificationReceived: function(noti, payload) {
        this.log("Notification received: " + noti);
        if (noti == "UPDATE_STOCK") {
            this.log(payload);
            var symbol = payload.quotes.price.symbol;
            this.stocks[symbol]["quotes"] = this.formatQuotes(payload.quotes);
            this.stocks[symbol]["hist"] = this.formatOHLC(payload.historical);
            this.updateData(this.config.mode);
            if (!this.loaded) { 
                this.loaded = true;
                this.log(this.name + " fully loaded...")
                this.startChartChanger();
            }
        }
        this.log("Stocks updated.");
        this.log(this.stocks);
    },


    formatQuotes: function(stock) {
        var quotes = {};
        var stockData = stock.price;
        var stockIndex = this.config.symbols.indexOf(stockData.symbol);
        var pPrice = this.config.purchasePrice[stockIndex] || 0;
        var stockQuote = {
            symbol: stockData.symbol,
            price: this.formatNumber(stockData.regularMarketPrice, this.config.decimals),
            open: this.formatNumber(stockData.regularMarketOpen, this.config.decimals),
            high: this.formatNumber(stockData.regularMarketDayHigh, this.config.decimals),
            low: this.formatNumber(stockData.regularMarketDayLow, this.config.decimals),
            prevClose: this.formatNumber(stockData.regularMarketPreviousClose, this.config.decimals),
            change: this.formatNumber(stockData.regularMarketPrice - stockData.regularMarketPreviousClose, this.config.decimals),
            changeP: this.formatNumber((stockData.regularMarketPrice - stockData.regularMarketPreviousClose)/stockData.regularMarketPreviousClose * 100, 1) + "%",
            volume: this.formatVolume(stockData.regularMarketVolume, 0),
            pPrice: (pPrice > 0) ? this.formatNumber(pPrice, this.config.decimals) : '--',
            perf2P: (pPrice > 0) ? this.formatNumber(-(100 - (stockData.regularMarketPreviousClose/pPrice)*100), 1) + '%' : '--',
            up: (stockData.regularMarketPrice > stockData.regularMarketPreviousClose) ? "up" : (stockData.regularMarketPrice < stockData.regularMarketPreviousClose) ? "down" : "",
            requestTime: moment(stockData.regularMarketTime).format("x"),
            profit: (pPrice <= stockData.regularMarketPrice) ? "profit" : "loss"
        }
        this.updateTime = Math.max(stockQuote.requestTime, this.updateTime) || stockQuote.requestTime;
        this.log(stockQuote);
        return stockQuote
    },
    
    
    formatOHLC: function(stock) {
        this.log(stock);
        var series = stock.quotes.sort(function (a,b) { return a[0] - b[0] })//.slice(stock.quotes.length - this.config.chartDays);
        var stockIndex = this.config.symbols.indexOf(stock.meta.symbol);
        var pPrice = this.config.purchasePrice[stockIndex] || 0;
        var values = {
            ohlc: [],
            quotes: [],
            volume: []
        };
        for (var i = 0; i < series.length; i++) {
            values.ohlc.push([
                parseInt(moment(series[i].date).format("x")), // the date
                parseFloat(series[i].open), // open
                parseFloat(series[i].high), // high
                parseFloat(series[i].low), // low
                parseFloat(series[i].close) // close
            ]);
            values.quotes.push([
                parseInt(moment(series[i].date).format("x")), // the date
                parseFloat(series[i].close) // close
            ])
            values.volume.push([
                parseInt(moment(series[i].date).format("x")), // the date
                parseInt(series[i].volume) // the volume
            ]);
        }
        this.log(values);
        //values.ohlc.sort(function (a,b) { return a[0] - b[0] });
        return values
    },
    
    
    formatNumber: function (number, digits) {
        return parseFloat(/*Math.abs(*/number/*)*/).toLocaleString(this.config.locale, {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits
        });
    },


    formatVolume: function(volume, digits) {
        if (volume > 9999999) {
            return this.formatNumber(volume/1000000, digits) + "m"
        } else if (volume > 700000) {
            return this.formatNumber(volume/1000000, digits+1) + "m"
        } else if (volume > 99999) {
            return this.formatNumber(volume/1000, digits) + "k"
        } else if (volume > 700) {
            return this.formatNumber(volume/1000, digits+1) + "k"
        } else if (volume == 0) {
            return ""
        } else {
            return volume
        }
    },
    

    updateChart: function(symbol) {
        this.log("Updating chart for " + symbol);
        var series = this.stocks[symbol].hist
        if (series["ohlc"]) {
            //update header
            var quote = this.stocks[symbol].quotes;
            var head = document.getElementById("stockchart_head");
            head.classList.remove("up","down","profit","loss");
            head.classList.add(quote.up, quote.profit);
            var symbolTag = document.getElementById("stockchart_symbol");
            symbolTag.innerHTML = this.getStockName(symbol);
            var priceTag = document.getElementById("stockchart_price");
            priceTag.innerHTML = quote.price;
            var changePTag = document.getElementById("stockchart_changeP");
            changePTag.innerHTML = quote.changeP;

            // Destroy existing chart if it exists
            if (this.chart) {
                this.chart.destroy();
                this.chart = null;
            }

            // Get the canvas element, create if doesn't exist
            var chartContainer = document.getElementById('AVSTOCK_CHART');
            var canvas = chartContainer.querySelector('canvas');
            if (!canvas) {
                canvas = document.createElement('canvas');
                chartContainer.appendChild(canvas);
            }

            // Format data for Chart.js
            var chartData = this.formatDataForChartJS(series, symbol);
            
            // Create Chart.js configuration
            var config = {
                type: this.getChartJSType(),
                data: chartData,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: 0
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                minUnit: 'day',
                                stepSize: 7,
                                displayFormats: {
                                    day: 'MMM DD',
                                    week: 'MMM DD',
                                    month: 'MMM YYYY'
                                }
                            },
                            display: !this.config.pureLine,
                            ticks: {
                                maxTicksLimit: 4,
                                color: this.config.chartLabelColor,
                                font: {
                                    size: 20,
                                    family: "inherit"
                                }
                            },
                            grid: {
                                display: false,
                                color: this.config.chartLineColor,
                                lineWidth: 1
                            },
                            border: {
                                display: !this.config.pureLine,
                                color: this.config.chartLineColor,
                                width: this.config.pureLine ? 0 : 2
                            }
                        },
                        y: {
                            type: 'linear',
                            position: 'right',
                            display: !this.config.pureLine,
                            ticks: {
                                color: this.config.chartLabelColor,
                                font: {
                                    size: 20,
                                    family: "inherit"
                                },
                                callback: function(value) {
                                    return (value < 10) ? value.toFixed(2) : value.toFixed(0);
                                }
                            },
                            grid: {
                                display: !this.config.pureLine,
                                color: this.config.chartLineColor,
                                lineWidth: this.config.pureLine ? 0 : 1
                            },
                            border: {
                                display: !this.config.pureLine,
                                color: this.config.chartLineColor,
                                width: this.config.pureLine ? 0 : 2
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    }
                }
            };

            // Add volume scale if volume is shown - create separate subplot effect
            if (this.config.showVolume && !this.config.pureLine) {
                // Get price range to calculate separated scales
                var priceRange = this.getPriceRange(series);
                var volumeMax = this.getVolumeScaleMax(series.volume);
                
                // Calculate the actual price minimum (where real price data starts)
                var actualPriceMin = priceRange.min;
                var actualVolumeMax = volumeMax;
                
                // Modify the price scale callback to hide labels in volume area
                config.options.scales.y.ticks.callback = function(value) {
                    // Hide labels below the actual price range (in volume area)
                    if (value < actualPriceMin) {
                        return ''; // Hide labels in volume area
                    }
                    return (value < 10) ? value.toFixed(2) : value.toFixed(0);
                };
                
                // Disable built-in grids - we'll draw custom ones
                config.options.scales.y.grid.display = false;
                
                // Configure volume axis for bottom portion of chart
                config.options.scales.volume = {
                    type: 'linear',
                    position: 'right',
                    display: true,
                    grid: {
                        display: false // Custom gridlines will handle this
                    },
                    ticks: {
                        color: '#eee',
                        font: {
                            size: 16,
                            family: "inherit"
                        },
                        maxTicksLimit: 20,
                        callback: function(value) {
                            // Only show labels for values within actual volume range (bottom portion)
                            if (value > actualVolumeMax) {
                                return ''; // Hide labels above actual volume data
                            }
                            
                            if (value === 0) return '0';
                            if (value >= 1000000) {
                                return (value / 1000000).toFixed(1) + 'M';
                            } else if (value >= 1000) {
                                return (value / 1000).toFixed(0) + 'K';
                            }
                            return Math.round(value).toString();
                        }
                    },
                    border: {
                        display: false
                    },
                    // Scale volume to use only bottom percentage of chart
                    max: volumeMax / (this.config.volumeChartPercent / 100),
                    min: 0
                };

                // Add custom gridline plugin
                if (!config.plugins) config.plugins = [];
                config.plugins.push({
                    id: 'customGridlines',
                    beforeDraw: function(chart) {
                        const ctx = chart.ctx;
                        const chartArea = chart.chartArea;
                        const scales = chart.scales;
                        
                        if (!scales.y || !scales.volume) return;
                        
                        ctx.save();
                        ctx.strokeStyle = '#eee';
                        ctx.lineWidth = 1;
                        ctx.globalAlpha = 0.3;
                        
                        // Draw price gridlines (only in top area where actual prices exist)
                        if (scales.y.ticks) {
                            scales.y.ticks.forEach(tick => {
                                if (tick.value >= actualPriceMin) {
                                    const y = scales.y.getPixelForValue(tick.value);
                                    if (y >= chartArea.top && y <= chartArea.bottom) {
                                        ctx.beginPath();
                                        ctx.moveTo(chartArea.left, y);
                                        ctx.lineTo(chartArea.right, y);
                                        ctx.stroke();
                                    }
                                }
                            });
                        }
                        
                        // Draw volume gridlines (only in bottom area where actual volume exists)
                        if (scales.volume.ticks) {
                            scales.volume.ticks.forEach(tick => {
                                if (tick.value <= actualVolumeMax && tick.value > 0) {
                                    const y = scales.volume.getPixelForValue(tick.value);
                                    if (y >= chartArea.top && y <= chartArea.bottom) {
                                        ctx.beginPath();
                                        ctx.moveTo(chartArea.left, y);
                                        ctx.lineTo(chartArea.right, y);
                                        ctx.stroke();
                                    }
                                }
                            });
                        }
                        
                        ctx.restore();
                    }
                });

                // Modify price scale to use only top portion of chart
                var expandedMin = this.config.showVolume
                    ? priceRange.max - (priceRange.max - priceRange.min) * 100.0 / (100.0 - this.config.volumeChartPercent)
                    : priceRange.min;

                console.log("Price range:", priceRange);
                console.log("Expanded min:", expandedMin);
                console.log("Actual price min (for hiding labels):", actualPriceMin);
                console.log("Actual volume max (for gridlines):", actualVolumeMax);

                config.options.scales.y.suggestedMin = expandedMin;
                config.options.scales.y.suggestedMax = priceRange.max;
                config.options.scales.y.position = 'left';
            }

            // Create the chart
            this.chart = new Chart(canvas, config);

            var tl = document.getElementById("AVSTOCK_TAGLINE");
            tl.innerHTML = "Last quote: " + moment(quote.requestTime, "x").format("MM-DD HH:mm");
        } else {
            console.error("Not enough data to update chart!");
        }
    },

    // Convert chart type from Highcharts to Chart.js financial types
    getChartJSType: function() {
        switch(this.config.chartType) {
            case 'candlestick':
                return 'candlestick';
            case 'ohlc':
                return 'ohlc';
            case 'line':
            default:
                return 'line';
        }
    },

    // Format data for Chart.js financial charts
    formatDataForChartJS: function(series, symbol) {
        var datasets = [];
        
        if (this.config.chartType === 'line') {
            // Line chart data format
            var lineData = series.quotes.map(function(point) {
                return {
                    x: point[0], // timestamp
                    y: point[1]  // close price
                };
            });
            
            datasets.push({
                label: symbol,
                data: lineData,
                borderColors: { up: "green", down: "red", unchanged: this.config.chartLineColor },
                borderColor: this.config.chartLineColor,
                backgroundColor: 'transparent',
                borderWidth: 5,
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0.1,
                fill: false
            });
        } else {
            // Financial chart data format (OHLC/Candlestick)
            var financialData = series.ohlc.map(function(point) {
                return {
                    x: point[0], // timestamp
                    o: point[1], // open
                    h: point[2], // high  
                    l: point[3], // low
                    c: point[4]  // close
                };
            });

            var upColor = this.config.coloredCandles ? 'rgba(0, 255, 0, 1.0)' : this.config.chartLineColor;
            var downColor = this.config.coloredCandles ? 'rgba(255, 0, 0, 1.0)' : this.config.chartLineColor;

            datasets.push({
                label: symbol,
                data: financialData,
                type: this.getChartJSType(),
                borderColors: {
                    up: upColor,
                    down: downColor,
                    unchanged: this.config.chartLineColor
                },
                backgroundColor: {
                    up: upColor,
                    down: downColor,
                    unchanged: this.config.chartLineColor
                },
                datalabels: {
                    display: false,
                }
            });
        }

        // Add volume dataset if enabled
        if (this.config.showVolume && !this.config.pureLine) {
            var volumeData = series.volume.map(function(point) {
                return {
                    x: point[0], // timestamp
                    y: point[1]  // volume
                };
            });

            datasets.push({
                label: 'Volume',
                data: volumeData,
                type: 'bar',
                backgroundColor: 'rgba(70, 130, 180, 1.0)', 
                borderColor: 'rgba(70, 130, 180, 1.0)',
                borderWidth: 0.5,
                yAxisID: 'volume',
                order: 2, // Render behind main chart
                barPercentage: 0.95, 
                categoryPercentage: 0.95,
                // Configure bars to appear in bottom area
                skipNull: true,
                datalabels: {
                    display: false,
                }
            });
        }

        return {
            datasets: datasets
        };
    },

    // Calculate appropriate max value for volume scale
    getVolumeScaleMax: function(volumeData) {
        if (!volumeData || volumeData.length === 0) return 1000000;
        var maxVolume = Math.max(...volumeData.map(v => v[1]));
        console.log("Volume data max:", maxVolume, "Sample volumes:", volumeData.slice(0, 3).map(v => v[1]));
        // Add 20% padding above max volume instead of 4x multiplier
        return maxVolume * 1.2;
    },

    // Calculate price range from OHLC or line data
    getPriceRange: function(series) {
        var prices = [];
        
        if (this.config.chartType === 'line' && series.quotes) {
            // For line charts, use close prices
            prices = series.quotes.map(function(point) {
                return point[1]; // close price
            });
        } else if (series.ohlc) {
            // For OHLC charts, use high and low values
            series.ohlc.forEach(function(point) {
                prices.push(point[2]); // high
                prices.push(point[3]); // low
            });
        }
        
        if (prices.length === 0) {
            return { min: 0, max: 100 };
        }
        
        var min = Math.min(...prices);
        var max = Math.max(...prices);
        
        // Add small padding to price range
        var padding = (max - min) * 0.02;
        
        return {
            min: min - padding,
            max: max + padding
        };
    },


    log: function (msg) {
        if (this.config && this.config.debug) {
            console.log(this.name + ": ", (msg));
        }
    },
});
