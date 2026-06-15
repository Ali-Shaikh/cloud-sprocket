package awsadapter

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/rds/types"
)

func TestRdsInstanceSummaryMapsEndpoint(t *testing.T) {
	got := rdsInstanceSummary(types.DBInstance{
		DBInstanceIdentifier: aws.String("app-db"),
		Engine:               aws.String("postgres"),
		EngineVersion:        aws.String("15.4"),
		DBInstanceStatus:     aws.String("available"),
		DBInstanceClass:      aws.String("db.t3.micro"),
		AllocatedStorage:     aws.Int32(20),
		MultiAZ:              aws.Bool(false),
		Endpoint: &types.Endpoint{
			Address: aws.String("app-db.abc123.us-east-1.rds.amazonaws.com"),
			Port:    aws.Int32(5432),
		},
	})
	if got.DBInstanceIdentifier != "app-db" || got.Endpoint != "app-db.abc123.us-east-1.rds.amazonaws.com:5432" {
		t.Fatalf("instance = %+v", got)
	}
}