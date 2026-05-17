# SynOdos Development Tasks

## Entity Management Models
The application requires robust data models to track the physical assets, locations, and legal entities involved in operations. These models will later tie into the HOS logging and compliance reporting.

### 1. Vehicle Management
Need to track fleet vehicles for compliance and maintenance.
- **Type**: Categorization of the vehicle (e.g., School Bus, Coach Bus, Semi-Truck, Box Truck, Taxi, Rideshare, Delivery Van).
- **VIN**: Vehicle Identification Number (17 characters).
- **License Plate**: Alphanumeric string with regional designation.
- **Mileage**: The current odometer reading (this value should be dynamically updated based on the end-of-day odometer readings entered in the daily logs).

### 2. Operator (Carrier/Company)
The legal entity responsible for the transportation operation.
- **Name**: Legal business name of the operator.
- **Address**: Principal place of business (main office address).
- **Phone Number**: Official contact number for the business/dispatch.

### 3. Yard (Terminal/Depot)
The physical location where vehicles are dispatched from or where the driver reports to work.
- **Name**: Common name of the yard (e.g., "North Hub", "Stittsville Depot").
- **Address**: Physical address of the yard.
- **Phone Number**: Contact number for the yard manager or local dispatch.
