// Performance Monitoring System
// Real-time monitoring of system performance, user experience, and business metrics

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            pageLoad: [],
            userActions: [],
            calculations: [],
            errors: [],
            businessKPIs: {}
        };
        this.thresholds = {
            pageLoadTime: 3000, // 3 seconds
            calculationTime: 1000, // 1 second
            errorRate: 0.01, // 1% error rate
            userSatisfaction: 4.0 // 4.0 out of 5.0
        };
        this.monitoring = false;
        this.reportingInterval = null;
    }

    /**
     * Initialize performance monitoring
     */
    initialize() {
        if (this.monitoring) return;

        console.log('📈 Performance Monitor initializing...');

        // Start monitoring
        this.startPageLoadMonitoring();
        this.startUserActionMonitoring();
        this.startErrorMonitoring();
        this.startBusinessMetricsTracking();
        this.startAutomatedReporting();

        this.monitoring = true;
        console.log('✅ Performance Monitor active');
    }

    /**
     * Monitor page load performance
     */
    startPageLoadMonitoring() {
        // Monitor page load times
        window.addEventListener('load', () => {
            const loadTime = performance.now();
            const entry = performance.getEntriesByType('navigation')[0];
            
            const metrics = {
                page: this.getCurrentPage(),
                loadTime: loadTime,
                domContentLoaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
                networkTime: entry.responseEnd - entry.requestStart,
                renderTime: entry.loadEventEnd - entry.responseEnd,
                timestamp: new Date(),
                userAgent: navigator.userAgent
            };

            this.recordPageLoadMetric(metrics);
            this.checkPageLoadThreshold(metrics);
        });

        // Monitor navigation timing
        if ('navigation' in performance && 'measure' in performance) {
            try {
                performance.mark('page-start');
                
                document.addEventListener('DOMContentLoaded', () => {
                    performance.mark('dom-ready');
                    performance.measure('dom-load', 'page-start', 'dom-ready');
                });
            } catch (error) {
                console.warn('Performance measurement not supported:', error);
            }
        }
    }

    /**
     * Monitor user actions and interactions
     */
    startUserActionMonitoring() {
        // Monitor clicks and user interactions
        document.addEventListener('click', (event) => {
            const element = event.target;
            const action = this.identifyUserAction(element);
            
            if (action) {
                const startTime = performance.now();
                
                // Monitor action completion time
                setTimeout(() => {
                    const completionTime = performance.now() - startTime;
                    this.recordUserAction({
                        action: action,
                        element: element.tagName + (element.id ? '#' + element.id : ''),
                        completionTime: completionTime,
                        page: this.getCurrentPage(),
                        timestamp: new Date()
                    });
                }, 100);
            }
        });

        // Monitor form submissions
        document.addEventListener('submit', (event) => {
            const startTime = performance.now();
            const form = event.target;
            
            setTimeout(() => {
                const completionTime = performance.now() - startTime;
                this.recordUserAction({
                    action: 'form-submit',
                    element: form.id || form.className,
                    completionTime: completionTime,
                    page: this.getCurrentPage(),
                    timestamp: new Date()
                });
            }, 100);
        });
    }

    /**
     * Monitor errors and exceptions
     */
    startErrorMonitoring() {
        // JavaScript errors
        window.addEventListener('error', (event) => {
            this.recordError({
                type: 'javascript',
                message: event.message,
                source: event.filename,
                line: event.lineno,
                column: event.colno,
                stack: event.error ? event.error.stack : null,
                page: this.getCurrentPage(),
                timestamp: new Date()
            });
        });

        // Promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.recordError({
                type: 'promise-rejection',
                message: event.reason,
                page: this.getCurrentPage(),
                timestamp: new Date()
            });
        });

        // Console errors (monkey patch)
        const originalConsoleError = console.error;
        console.error = (...args) => {
            this.recordError({
                type: 'console-error',
                message: args.join(' '),
                page: this.getCurrentPage(),
                timestamp: new Date()
            });
            originalConsoleError.apply(console, args);
        };
    }

    /**
     * Track business metrics and KPIs
     */
    startBusinessMetricsTracking() {
        // Track calculator usage
        this.trackCalculatorUsage();
        
        // Track data export usage
        this.trackExportUsage();
        
        // Track plan management actions
        this.trackPlanManagementUsage();
        
        // Track user satisfaction (placeholder for future survey integration)
        this.trackUserSatisfaction();
    }

    /**
     * Track revenue calculator usage
     */
    trackCalculatorUsage() {
        // Monitor when calculator functions are called
        if (window.revenueCalculator) {
            const originalCalculate = window.revenueCalculator.calculateFirstYearTPA;
            window.revenueCalculator.calculateFirstYearTPA = (...args) => {
                const startTime = performance.now();
                
                try {
                    const result = originalCalculate.apply(window.revenueCalculator, args);
                    const calculationTime = performance.now() - startTime;
                    
                    this.recordCalculationMetric({
                        type: 'first-year-tpa',
                        calculationTime: calculationTime,
                        success: true,
                        page: this.getCurrentPage(),
                        timestamp: new Date()
                    });
                    
                    return result;
                } catch (error) {
                    this.recordCalculationMetric({
                        type: 'first-year-tpa',
                        calculationTime: performance.now() - startTime,
                        success: false,
                        error: error.message,
                        page: this.getCurrentPage(),
                        timestamp: new Date()
                    });
                    throw error;
                }
            };
        }
    }

    /**
     * Track export functionality usage
     */
    trackExportUsage() {
        // Monitor export button clicks
        document.addEventListener('click', (event) => {
            const element = event.target;
            if (element.textContent.includes('Export') || element.className.includes('export')) {
                this.recordBusinessMetric('export_usage', {
                    type: this.identifyExportType(element),
                    page: this.getCurrentPage(),
                    timestamp: new Date()
                });
            }
        });
    }

    /**
     * Track plan management actions
     */
    trackPlanManagementUsage() {
        // Monitor plan-related actions
        const planActions = ['view', 'edit', 'save', 'delete', 'terminate'];
        
        document.addEventListener('click', (event) => {
            const action = this.identifyPlanAction(event.target);
            if (action && planActions.includes(action)) {
                this.recordBusinessMetric('plan_management', {
                    action: action,
                    page: this.getCurrentPage(),
                    timestamp: new Date()
                });
            }
        });
    }

    /**
     * Track user satisfaction (framework for future surveys)
     */
    trackUserSatisfaction() {
        // Placeholder for user satisfaction tracking
        // This would integrate with survey tools or feedback forms
        
        // Monitor session duration as proxy for engagement
        const sessionStart = Date.now();
        
        window.addEventListener('beforeunload', () => {
            const sessionDuration = Date.now() - sessionStart;
            this.recordBusinessMetric('session_duration', {
                duration: sessionDuration,
                page: this.getCurrentPage(),
                timestamp: new Date()
            });
        });
    }

    /**
     * Start automated reporting
     */
    startAutomatedReporting() {
        // Generate performance reports every 5 minutes
        this.reportingInterval = setInterval(() => {
            this.generatePerformanceReport();
        }, 5 * 60 * 1000);

        // Generate daily summary at end of day
        const now = new Date();
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        const timeUntilEndOfDay = endOfDay.getTime() - now.getTime();
        
        setTimeout(() => {
            this.generateDailyReport();
            
            // Schedule daily reports
            setInterval(() => {
                this.generateDailyReport();
            }, 24 * 60 * 60 * 1000);
        }, timeUntilEndOfDay);
    }

    /**
     * Record performance metrics
     */
    recordPageLoadMetric(metric) {
        this.metrics.pageLoad.push(metric);
        
        // Keep only last 100 entries
        if (this.metrics.pageLoad.length > 100) {
            this.metrics.pageLoad.shift();
        }
        
        console.log(`📊 Page load: ${metric.page} in ${metric.loadTime.toFixed(0)}ms`);
    }

    recordUserAction(action) {
        this.metrics.userActions.push(action);
        
        // Keep only last 200 entries
        if (this.metrics.userActions.length > 200) {
            this.metrics.userActions.shift();
        }
    }

    recordCalculationMetric(metric) {
        this.metrics.calculations.push(metric);
        
        // Keep only last 100 entries
        if (this.metrics.calculations.length > 100) {
            this.metrics.calculations.shift();
        }
        
        if (metric.calculationTime > this.thresholds.calculationTime) {
            console.warn(`⚠️ Slow calculation: ${metric.type} took ${metric.calculationTime.toFixed(0)}ms`);
        }
    }

    recordError(error) {
        this.metrics.errors.push(error);
        
        // Keep only last 50 errors
        if (this.metrics.errors.length > 50) {
            this.metrics.errors.shift();
        }
        
        console.error('🚨 Error recorded:', error);
        
        // Check error rate threshold
        this.checkErrorRateThreshold();
    }

    recordBusinessMetric(metric, data) {
        if (!this.metrics.businessKPIs[metric]) {
            this.metrics.businessKPIs[metric] = [];
        }
        
        this.metrics.businessKPIs[metric].push(data);
        
        // Keep only last 100 entries per metric
        if (this.metrics.businessKPIs[metric].length > 100) {
            this.metrics.businessKPIs[metric].shift();
        }
    }

    /**
     * Check performance thresholds and alert if exceeded
     */
    checkPageLoadThreshold(metric) {
        if (metric.loadTime > this.thresholds.pageLoadTime) {
            console.warn(`⚠️ Slow page load: ${metric.page} took ${metric.loadTime.toFixed(0)}ms (threshold: ${this.thresholds.pageLoadTime}ms)`);
            
            // In production, this would trigger alerts
            this.triggerPerformanceAlert('slow_page_load', metric);
        }
    }

    checkErrorRateThreshold() {
        const recentErrors = this.metrics.errors.filter(error => 
            Date.now() - error.timestamp.getTime() < 60000 // Last minute
        );
        
        const recentActions = this.metrics.userActions.filter(action =>
            Date.now() - action.timestamp.getTime() < 60000
        ).length;
        
        if (recentActions > 0) {
            const errorRate = recentErrors.length / recentActions;
            
            if (errorRate > this.thresholds.errorRate) {
                console.warn(`🚨 High error rate: ${(errorRate * 100).toFixed(2)}% (threshold: ${(this.thresholds.errorRate * 100).toFixed(2)}%)`);
                
                this.triggerPerformanceAlert('high_error_rate', {
                    errorRate: errorRate,
                    recentErrors: recentErrors.length,
                    recentActions: recentActions
                });
            }
        }
    }

    /**
     * Generate performance reports
     */
    generatePerformanceReport() {
        const report = {
            timestamp: new Date(),
            timeframe: '5_minutes',
            metrics: {
                pageLoads: this.getPageLoadSummary(),
                userActions: this.getUserActionSummary(),
                calculations: this.getCalculationSummary(),
                errors: this.getErrorSummary(),
                businessKPIs: this.getBusinessKPISummary()
            },
            alerts: this.getActiveAlerts()
        };

        console.log('📊 Performance Report:', report);
        
        // In production, this would send to monitoring service
        this.sendToMonitoringService(report);
    }

    generateDailyReport() {
        const report = {
            timestamp: new Date(),
            timeframe: 'daily',
            metrics: this.getDailyMetricsSummary(),
            trends: this.getPerformanceTrends(),
            recommendations: this.getPerformanceRecommendations()
        };

        console.log('📈 Daily Performance Report:', report);
        
        // In production, this would generate and email daily report
        this.generateDailyReportEmail(report);
    }

    /**
     * Metric summary calculations
     */
    getPageLoadSummary() {
        const recentLoads = this.metrics.pageLoad.filter(load => 
            Date.now() - load.timestamp.getTime() < 5 * 60 * 1000 // Last 5 minutes
        );

        if (recentLoads.length === 0) return null;

        const loadTimes = recentLoads.map(load => load.loadTime);
        const avgLoadTime = loadTimes.reduce((sum, time) => sum + time, 0) / loadTimes.length;
        const maxLoadTime = Math.max(...loadTimes);
        const minLoadTime = Math.min(...loadTimes);

        return {
            count: recentLoads.length,
            averageTime: avgLoadTime,
            maxTime: maxLoadTime,
            minTime: minLoadTime,
            slowLoads: recentLoads.filter(load => load.loadTime > this.thresholds.pageLoadTime).length
        };
    }

    getUserActionSummary() {
        const recentActions = this.metrics.userActions.filter(action => 
            Date.now() - action.timestamp.getTime() < 5 * 60 * 1000
        );

        const actionTypes = {};
        recentActions.forEach(action => {
            actionTypes[action.action] = (actionTypes[action.action] || 0) + 1;
        });

        return {
            totalActions: recentActions.length,
            actionTypes: actionTypes,
            averageCompletionTime: recentActions.length > 0 ? 
                recentActions.reduce((sum, action) => sum + (action.completionTime || 0), 0) / recentActions.length : 0
        };
    }

    getCalculationSummary() {
        const recentCalculations = this.metrics.calculations.filter(calc => 
            Date.now() - calc.timestamp.getTime() < 5 * 60 * 1000
        );

        if (recentCalculations.length === 0) return null;

        const calcTimes = recentCalculations.map(calc => calc.calculationTime);
        const avgCalcTime = calcTimes.reduce((sum, time) => sum + time, 0) / calcTimes.length;
        const slowCalculations = recentCalculations.filter(calc => calc.calculationTime > this.thresholds.calculationTime).length;
        const failedCalculations = recentCalculations.filter(calc => !calc.success).length;

        return {
            count: recentCalculations.length,
            averageTime: avgCalcTime,
            slowCalculations: slowCalculations,
            failedCalculations: failedCalculations,
            successRate: ((recentCalculations.length - failedCalculations) / recentCalculations.length) * 100
        };
    }

    getErrorSummary() {
        const recentErrors = this.metrics.errors.filter(error => 
            Date.now() - error.timestamp.getTime() < 5 * 60 * 1000
        );

        const errorTypes = {};
        recentErrors.forEach(error => {
            errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
        });

        return {
            totalErrors: recentErrors.length,
            errorTypes: errorTypes,
            criticalErrors: recentErrors.filter(error => error.type === 'javascript' || error.type === 'promise-rejection').length
        };
    }

    getBusinessKPISummary() {
        const summary = {};
        
        Object.keys(this.metrics.businessKPIs).forEach(metric => {
            const recentData = this.metrics.businessKPIs[metric].filter(data =>
                Date.now() - data.timestamp.getTime() < 5 * 60 * 1000
            );
            
            summary[metric] = {
                count: recentData.length,
                data: recentData
            };
        });

        return summary;
    }

    /**
     * Helper methods
     */
    getCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('revenue-dashboard')) return 'revenue-dashboard';
        if (path.includes('revenue-analytics')) return 'revenue-analytics';
        if (path.includes('providers')) return 'providers';
        if (path.includes('plan-revenue')) return 'plan-revenue';
        if (path.includes('revenue-import')) return 'revenue-import';
        return 'unknown';
    }

    identifyUserAction(element) {
        const text = element.textContent?.toLowerCase() || '';
        const className = element.className?.toLowerCase() || '';
        
        if (text.includes('calculate') || className.includes('calculate')) return 'calculate';
        if (text.includes('export') || className.includes('export')) return 'export';
        if (text.includes('save') || className.includes('save')) return 'save';
        if (text.includes('search') || className.includes('search')) return 'search';
        if (text.includes('filter') || className.includes('filter')) return 'filter';
        if (element.tagName === 'BUTTON') return 'button-click';
        if (element.tagName === 'A') return 'navigation';
        
        return null;
    }

    identifyExportType(element) {
        const text = element.textContent?.toLowerCase() || '';
        if (text.includes('csv')) return 'csv';
        if (text.includes('pdf')) return 'pdf';
        if (text.includes('excel')) return 'excel';
        return 'unknown';
    }

    identifyPlanAction(element) {
        const text = element.textContent?.toLowerCase() || '';
        const className = element.className?.toLowerCase() || '';
        
        if (text.includes('view') || className.includes('view')) return 'view';
        if (text.includes('edit') || className.includes('edit')) return 'edit';
        if (text.includes('save') || className.includes('save')) return 'save';
        if (text.includes('delete') || className.includes('delete')) return 'delete';
        if (text.includes('terminate') || className.includes('terminate')) return 'terminate';
        
        return null;
    }

    /**
     * Alert system
     */
    triggerPerformanceAlert(alertType, data) {
        const alert = {
            type: alertType,
            severity: this.getAlertSeverity(alertType),
            data: data,
            timestamp: new Date(),
            page: this.getCurrentPage()
        };

        console.warn('🚨 Performance Alert:', alert);
        
        // In production, this would:
        // - Send email notifications
        // - Post to Slack/Teams
        // - Create incident tickets
        // - Trigger automated responses
    }

    getAlertSeverity(alertType) {
        const severityMap = {
            'slow_page_load': 'medium',
            'high_error_rate': 'high',
            'calculation_failure': 'high',
            'system_unavailable': 'critical'
        };
        
        return severityMap[alertType] || 'low';
    }

    getActiveAlerts() {
        // Return active alerts from the last hour
        // In production, this would query alert database
        return [];
    }

    /**
     * External service integration (placeholder)
     */
    sendToMonitoringService(report) {
        // In production, this would send to monitoring services like:
        // - New Relic
        // - Datadog
        // - Google Analytics
        // - Custom monitoring dashboard
        
        // For now, just log to console
        console.log('📊 Sending performance data to monitoring service:', report);
    }

    generateDailyReportEmail(report) {
        // In production, this would generate and send daily email reports
        console.log('📧 Daily report email would be sent with:', report);
    }

    /**
     * Trend analysis (placeholder for future enhancement)
     */
    getPerformanceTrends() {
        return {
            pageLoadTrend: 'stable',
            errorRateTrend: 'decreasing',
            userSatisfactionTrend: 'improving'
        };
    }

    getPerformanceRecommendations() {
        const recommendations = [];
        
        // Analyze recent metrics and provide recommendations
        const avgPageLoad = this.getPageLoadSummary()?.averageTime;
        if (avgPageLoad > this.thresholds.pageLoadTime) {
            recommendations.push({
                type: 'performance',
                priority: 'medium',
                message: 'Consider optimizing page load times by implementing lazy loading for charts and tables'
            });
        }
        
        const errorRate = this.getErrorSummary()?.totalErrors || 0;
        if (errorRate > 5) {
            recommendations.push({
                type: 'reliability',
                priority: 'high', 
                message: 'High error count detected. Review error logs and implement additional error handling'
            });
        }

        return recommendations;
    }

    /**
     * Public API for manual reporting
     */
    getSystemHealth() {
        return {
            status: this.getOverallSystemStatus(),
            metrics: {
                pageLoad: this.getPageLoadSummary(),
                errors: this.getErrorSummary(),
                calculations: this.getCalculationSummary(),
                userActions: this.getUserActionSummary()
            },
            uptime: this.getUptime(),
            lastUpdate: new Date()
        };
    }

    getOverallSystemStatus() {
        const errorSummary = this.getErrorSummary();
        const pageLoadSummary = this.getPageLoadSummary();
        
        if (errorSummary?.criticalErrors > 0) return 'degraded';
        if (pageLoadSummary?.slowLoads > 5) return 'slow';
        if (errorSummary?.totalErrors > 10) return 'warning';
        
        return 'healthy';
    }

    getUptime() {
        // Simple uptime calculation based on when monitoring started
        const now = Date.now();
        const startTime = this.metrics.pageLoad[0]?.timestamp.getTime() || now;
        return now - startTime;
    }

    /**
     * Stop monitoring (for cleanup)
     */
    stop() {
        if (this.reportingInterval) {
            clearInterval(this.reportingInterval);
            this.reportingInterval = null;
        }
        
        this.monitoring = false;
        console.log('📊 Performance monitoring stopped');
    }
}

// Create global instance
window.performanceMonitor = new PerformanceMonitor();

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Add small delay to let other systems initialize first
    setTimeout(() => {
        window.performanceMonitor.initialize();
    }, 1000);
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceMonitor;
}

// Expose public API for manual health checks
window.getSystemHealth = () => window.performanceMonitor.getSystemHealth();

// Example usage:
//
// // Get current system health
// const health = window.getSystemHealth();
// console.log('System Health:', health);
//
// // Stop monitoring (for cleanup)
// window.performanceMonitor.stop();
//
// // Custom performance tracking
// window.performanceMonitor.recordBusinessMetric('custom_action', {
//     action: 'quarterly_report_generated',
//     timestamp: new Date()
// });


















